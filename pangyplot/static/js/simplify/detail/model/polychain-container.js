/**
 * PolychainContainer — manages the permanent physics spine for a chain.
 *
 * NOT a SimObject. It's a plain manager class that:
 * - Owns spine nodes/links (permanent, always in sim, never drawn)
 * - Updates segment anchor positions each frame
 * - Provides visible polyline geometry (spine minus masked regions)
 * - Manages split/merge lifecycle on pop/unpop
 *
 * The spine nodes keep their chainId = this.id throughout. No ghost
 * suffix, no re-keying, no flag toggling — they are always the spine.
 */

import { PolychainSegment } from './polychain-segment.js';
import * as registry from './segment-registry.js';

export class PolychainContainer {
    /**
     * @param {object} opts
     * @param {string} opts.id        — root chain ID (e.g. "c42")
     * @param {object[]} opts.spineNodes — d3 force nodes for the spine
     * @param {object[]} opts.spineLinks — d3 force links between spine nodes
     * @param {string[]} opts.headSegs  — source segment IDs (chain head)
     * @param {string[]} opts.tailSegs  — sink segment IDs (chain tail)
     * @param {Array} [opts.bubbleMeta] — full bubble metadata for the chain
     */
    constructor(opts) {
        this.id = opts.id;
        this.spineNodes = opts.spineNodes || [];
        this.spineLinks = opts.spineLinks || [];

        // Tag spine links so they're never confused with GFA links
        for (const l of this.spineLinks) {
            l.isSpineLink = true;
        }
        // Tag spine nodes
        for (const n of this.spineNodes) {
            n.isSpineNode = true;
            n.chainId = this.id;
        }

        this.headSegs = (opts.headSegs || []).map(String);
        this.tailSegs = (opts.tailSegs || []).map(String);
        this.bubbleMeta = opts.bubbleMeta || [];

        /** @type {RenderMask[]} — [{tStart, tEnd, bubbleId}] */
        this.renderMasks = [];

        /** @type {PolychainSegment[]} */
        this.segments = [];

        // Precompute cumulative arc lengths for spine interpolation
        this._cumLen = null;
        this._totalLen = 0;
        this._computeCumLen();

        // Create initial full-chain segment
        this._createInitialSegment();
    }

    // --- Cumulative arc length ---

    _computeCumLen() {
        const nodes = this.spineNodes;
        const n = nodes.length;
        if (n < 2) { this._cumLen = [0]; this._totalLen = 0; return; }

        const cum = new Float64Array(n);
        cum[0] = 0;
        for (let i = 1; i < n; i++) {
            const dx = nodes[i].x - nodes[i - 1].x;
            const dy = nodes[i].y - nodes[i - 1].y;
            cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy);
        }
        this._cumLen = cum;
        this._totalLen = cum[n - 1] || 1;
    }

    /**
     * Interpolate exact x,y on the spine at normalized position t ∈ [0,1].
     * @param {number} t
     * @returns {{ x: number, y: number }}
     */
    getSpinePositionAt(t) {
        const nodes = this.spineNodes;
        if (nodes.length === 0) return { x: 0, y: 0 };
        if (nodes.length === 1 || t <= 0) return { x: nodes[0].x, y: nodes[0].y };
        if (t >= 1) return { x: nodes[nodes.length - 1].x, y: nodes[nodes.length - 1].y };

        // Recompute cumulative lengths from live positions
        const n = nodes.length;
        let totalLen = 0;
        const cum = this._cumLen;
        cum[0] = 0;
        for (let i = 1; i < n; i++) {
            const dx = nodes[i].x - nodes[i - 1].x;
            const dy = nodes[i].y - nodes[i - 1].y;
            cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy);
        }
        totalLen = cum[n - 1] || 1;

        const targetDist = t * totalLen;

        // Binary search for the segment
        let lo = 0, hi = n - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (cum[mid] < targetDist) lo = mid;
            else hi = mid;
        }

        const segLen = cum[hi] - cum[lo];
        if (segLen < 1e-9) return { x: nodes[lo].x, y: nodes[lo].y };
        const frac = (targetDist - cum[lo]) / segLen;
        return {
            x: nodes[lo].x + frac * (nodes[hi].x - nodes[lo].x),
            y: nodes[lo].y + frac * (nodes[hi].y - nodes[lo].y),
        };
    }

    // --- Initial segment ---

    _createInitialSegment() {
        const headPos = this.spineNodes.length > 0
            ? { x: this.spineNodes[0].x, y: this.spineNodes[0].y }
            : { x: 0, y: 0 };
        const tailPos = this.spineNodes.length > 1
            ? { x: this.spineNodes[this.spineNodes.length - 1].x,
                y: this.spineNodes[this.spineNodes.length - 1].y }
            : headPos;

        const seg = new PolychainSegment({
            id: this.id,
            containerId: this.id,
            headSegs: this.headSegs,
            tailSegs: this.tailSegs,
            tRange: { start: 0, end: 1 },
            container: this,
            headPos,
            tailPos,
            bubbleMeta: this.bubbleMeta,
        });

        this.segments = [seg];

        // Register ends
        registry.registerAll(this.headSegs, seg);
        registry.registerAll(this.tailSegs, seg);
    }

    // --- Per-frame update ---

    /**
     * Update all segment anchor positions from live spine node positions.
     * Called each frame by the force tick or pre-render step.
     */
    updateAnchors() {
        for (const seg of this.segments) {
            const headPos = this.getSpinePositionAt(seg.tRange.start);
            const tailPos = this.getSpinePositionAt(seg.tRange.end);
            seg.updateAnchors(headPos, tailPos);
        }
    }

    // --- Split/Merge ---

    /**
     * Split a segment at a bubble pop.
     * @param {string} bubbleId
     * @param {number} tPosition — normalized t of the popped bubble
     * @param {number} tWidth    — width of the gap in t-space
     * @param {string[]} sourceSegs — source segs of the popped bubble
     * @param {string[]} sinkSegs   — sink segs of the popped bubble
     * @returns {{ leftSegment: PolychainSegment, rightSegment: PolychainSegment }}
     */
    splitAtBubble(bubbleId, tPosition, tWidth, sourceSegs, sinkSegs) {
        const tStart = tPosition - tWidth / 2;
        const tEnd = tPosition + tWidth / 2;

        // Add render mask
        this.renderMasks.push({ tStart, tEnd, bubbleId });

        // Find which segment covers this t
        const segIdx = this.segments.findIndex(
            s => s.tRange.start <= tPosition && s.tRange.end >= tPosition
        );
        if (segIdx === -1) throw new Error(`No segment covers t=${tPosition}`);

        const oldSeg = this.segments[segIdx];

        // Unregister old segment's ends
        registry.unregisterAll(oldSeg.ends.head);
        registry.unregisterAll(oldSeg.ends.tail);

        // Create left segment: [oldStart, tStart]
        const leftSeg = new PolychainSegment({
            id: `${this.id}:${this.segments.length}`,
            containerId: this.id,
            headSegs: oldSeg.ends.head,
            tailSegs: sourceSegs.map(String),
            tRange: { start: oldSeg.tRange.start, end: tStart },
            container: this,
            headPos: this.getSpinePositionAt(oldSeg.tRange.start),
            tailPos: this.getSpinePositionAt(tStart),
            bubbleMeta: this._splitBubbleMeta(oldSeg.interior, oldSeg.tRange, { start: oldSeg.tRange.start, end: tStart }),
        });

        // Create right segment: [tEnd, oldEnd]
        const rightSeg = new PolychainSegment({
            id: `${this.id}:${this.segments.length + 1}`,
            containerId: this.id,
            headSegs: sinkSegs.map(String),
            tailSegs: oldSeg.ends.tail,
            tRange: { start: tEnd, end: oldSeg.tRange.end },
            container: this,
            headPos: this.getSpinePositionAt(tEnd),
            tailPos: this.getSpinePositionAt(oldSeg.tRange.end),
            bubbleMeta: this._splitBubbleMeta(oldSeg.interior, oldSeg.tRange, { start: tEnd, end: oldSeg.tRange.end }),
        });

        // Replace old segment
        this.segments.splice(segIdx, 1, leftSeg, rightSeg);

        // Register new ends
        registry.registerAll(leftSeg.ends.head, leftSeg);
        registry.registerAll(leftSeg.ends.tail, leftSeg);
        registry.registerAll(rightSeg.ends.head, rightSeg);
        registry.registerAll(rightSeg.ends.tail, rightSeg);

        // Destroy old segment's anchor nodes (they're no longer in the sim)
        oldSeg.physicsNodes = [];

        return { leftSegment: leftSeg, rightSegment: rightSeg, removedSegment: oldSeg };
    }

    /**
     * Merge segments back after unpop.
     * @param {string} bubbleId
     * @returns {{ mergedSegment: PolychainSegment, removedSegments: PolychainSegment[] }}
     */
    mergeAtBubble(bubbleId) {
        // Find and remove the render mask
        const maskIdx = this.renderMasks.findIndex(m => m.bubbleId === bubbleId);
        if (maskIdx === -1) throw new Error(`No render mask for bubble ${bubbleId}`);
        const mask = this.renderMasks[maskIdx];
        this.renderMasks.splice(maskIdx, 1);

        // Find the two segments on either side of this gap
        const leftIdx = this.segments.findIndex(s => Math.abs(s.tRange.end - mask.tStart) < 1e-9);
        const rightIdx = this.segments.findIndex(s => Math.abs(s.tRange.start - mask.tEnd) < 1e-9);
        if (leftIdx === -1 || rightIdx === -1) throw new Error(`Cannot find segments around mask for ${bubbleId}`);

        const leftSeg = this.segments[leftIdx];
        const rightSeg = this.segments[rightIdx];

        // Unregister old ends
        registry.unregisterAll(leftSeg.ends.head);
        registry.unregisterAll(leftSeg.ends.tail);
        registry.unregisterAll(rightSeg.ends.head);
        registry.unregisterAll(rightSeg.ends.tail);

        // Create merged segment
        const mergedBubbles = [...(leftSeg.interior || []), ...(rightSeg.interior || [])];
        const mergedSeg = new PolychainSegment({
            id: `${this.id}:${this.segments.length}`,
            containerId: this.id,
            headSegs: leftSeg.ends.head,
            tailSegs: rightSeg.ends.tail,
            tRange: { start: leftSeg.tRange.start, end: rightSeg.tRange.end },
            container: this,
            headPos: this.getSpinePositionAt(leftSeg.tRange.start),
            tailPos: this.getSpinePositionAt(rightSeg.tRange.end),
            bubbleMeta: mergedBubbles,
        });

        // Remove old segments, insert merged
        const removeIndices = [leftIdx, rightIdx].sort((a, b) => b - a);
        for (const idx of removeIndices) this.segments.splice(idx, 1);
        // Insert at the position of the earlier segment
        const insertIdx = Math.min(leftIdx, rightIdx);
        this.segments.splice(insertIdx, 0, mergedSeg);

        // Register merged ends
        registry.registerAll(mergedSeg.ends.head, mergedSeg);
        registry.registerAll(mergedSeg.ends.tail, mergedSeg);

        // Clean up old anchor nodes
        leftSeg.physicsNodes = [];
        rightSeg.physicsNodes = [];

        return { mergedSegment: mergedSeg, removedSegments: [leftSeg, rightSeg] };
    }

    // --- Rendering ---

    /**
     * Get visible polyline specs (spine minus masked regions).
     * @returns {RenderSpec[]}
     */
    getRenderables() {
        if (this.spineNodes.length < 2) return [];

        const specs = [];
        const masks = this.renderMasks
            .map(m => [m.tStart, m.tEnd])
            .sort((a, b) => a[0] - b[0]);

        // Build visible t-ranges by subtracting masks from [0, 1]
        const visibleRanges = [];
        let cursor = 0;
        for (const [mStart, mEnd] of masks) {
            if (mStart > cursor) visibleRanges.push([cursor, mStart]);
            cursor = Math.max(cursor, mEnd);
        }
        if (cursor < 1) visibleRanges.push([cursor, 1]);

        // For each visible range, emit a polyline spec from spine node positions
        for (const [tStart, tEnd] of visibleRanges) {
            const points = this._getSpinePointsInRange(tStart, tEnd);
            if (points.length >= 2) {
                specs.push({
                    type: 'polyline',
                    points,
                    colorKey: this,
                    layer: 'chain',
                });
            }
        }

        return specs;
    }

    _getSpinePointsInRange(tStart, tEnd) {
        const nodes = this.spineNodes;
        const n = nodes.length;
        if (n < 2) return [];

        // Recompute cumulative lengths from live positions
        const cum = this._cumLen;
        cum[0] = 0;
        for (let i = 1; i < n; i++) {
            const dx = nodes[i].x - nodes[i - 1].x;
            const dy = nodes[i].y - nodes[i - 1].y;
            cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy);
        }
        const totalLen = cum[n - 1] || 1;

        const dStart = tStart * totalLen;
        const dEnd = tEnd * totalLen;

        const points = [];

        // Add interpolated start point
        const startPos = this.getSpinePositionAt(tStart);
        points.push([startPos.x, startPos.y]);

        // Add all spine nodes within range
        for (let i = 0; i < n; i++) {
            if (cum[i] > dStart && cum[i] < dEnd) {
                points.push([nodes[i].x, nodes[i].y]);
            }
        }

        // Add interpolated end point
        const endPos = this.getSpinePositionAt(tEnd);
        points.push([endPos.x, endPos.y]);

        return points;
    }

    _splitBubbleMeta(bubbles, oldRange, newRange) {
        if (!bubbles || !bubbles.length) return [];
        const oldSpan = oldRange.end - oldRange.start;
        if (oldSpan < 1e-9) return [];
        return bubbles.filter(b => {
            const globalT = oldRange.start + b.t * oldSpan;
            return globalT >= newRange.start && globalT <= newRange.end;
        }).map(b => {
            const globalT = oldRange.start + b.t * oldSpan;
            const newSpan = newRange.end - newRange.start;
            return { ...b, t: newSpan > 1e-9 ? (globalT - newRange.start) / newSpan : 0.5 };
        });
    }

    /**
     * Collect all anchor nodes from all segments (for adding to force sim).
     * @returns {object[]}
     */
    getAllAnchorNodes() {
        const nodes = [];
        for (const seg of this.segments) {
            nodes.push(seg.headAnchor, seg.tailAnchor);
        }
        return nodes;
    }

    /**
     * Destroy all segments and clear registrations.
     */
    destroy() {
        for (const seg of this.segments) {
            registry.unregisterAll(seg.ends.head);
            registry.unregisterAll(seg.ends.tail);
            seg.physicsNodes = [];
        }
        this.segments = [];
        this.renderMasks = [];
        this.spineNodes = [];
        this.spineLinks = [];
    }
}
