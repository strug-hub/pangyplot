/**
 * PolychainContainer — queryable spine for a chain.
 *
 * NOT a SimObject. A plain manager that:
 * - Owns the full invisible spine (nodes + links, always in D3 sim, never drawn)
 * - Knows all bubbles on the chain and their t-positions (0–1 fractional)
 * - Tracks which bubbles are popped
 * - Exposes query functions: positionAt(t), polylineInRange(tStart, tEnd)
 * - Manages split/merge of PolychainSegments on pop/unpop
 *
 * The container does NOT render. Segments pull positions from the container
 * and render themselves.
 */

import { PolychainSegment } from './polychain-segment.js';
import * as registry from './segment-registry.js';

export class PolychainContainer {
    /**
     * @param {object} opts
     * @param {string} opts.id          — root chain ID (e.g. "c42")
     * @param {object[]} opts.spineNodes — d3 force nodes for the spine
     * @param {object[]} opts.spineLinks — d3 force links between spine nodes
     * @param {string[]} opts.headSegs   — source segment IDs (chain head)
     * @param {string[]} opts.tailSegs   — sink segment IDs (chain tail)
     * @param {Array} [opts.bubbles]     — bubble metadata [{id, t, ...}, ...]
     */
    constructor(opts) {
        this.id = opts.id;
        this.spineNodes = opts.spineNodes || [];
        this.spineLinks = opts.spineLinks || [];

        // Tag spine links so they're never confused with GFA links
        for (const l of this.spineLinks) l.isSpineLink = true;
        // Tag spine nodes
        for (const n of this.spineNodes) {
            n.isSpineNode = true;
            n.chainId = this.id;
        }

        this.headSegs = (opts.headSegs || []).map(String);
        this.tailSegs = (opts.tailSegs || []).map(String);

        /** All bubbles on this chain with their t-positions. */
        this.bubbles = opts.bubbles || [];

        /** Bubble IDs that have been popped. */
        this.poppedBubbles = new Set();

        /** @type {PolychainSegment[]} */
        this.segments = [];

        // Scratch buffer for cumulative arc lengths (reused each query)
        this._cumLen = new Float64Array(Math.max(this.spineNodes.length, 2));

        // Create initial full-chain segment
        this._createInitialSegment();
    }

    // ---------------------------------------------------------------
    // Query API — segments call these
    // ---------------------------------------------------------------

    /**
     * Interpolate a point on the live spine at normalized position t ∈ [0,1].
     * @param {number} t
     * @returns {{ x: number, y: number }}
     */
    positionAt(t) {
        const nodes = this.spineNodes;
        if (nodes.length === 0) return { x: 0, y: 0 };
        if (nodes.length === 1 || t <= 0) return { x: nodes[0].x, y: nodes[0].y };
        if (t >= 1) { const last = nodes[nodes.length - 1]; return { x: last.x, y: last.y }; }

        this._refreshCumLen();
        const totalLen = this._cumLen[nodes.length - 1] || 1;
        const targetDist = t * totalLen;

        // Binary search for the spine segment containing targetDist
        const cum = this._cumLen;
        const n = nodes.length;
        let lo = 0, hi = n - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (cum[mid] < targetDist) lo = mid; else hi = mid;
        }

        const segLen = cum[hi] - cum[lo];
        if (segLen < 1e-9) return { x: nodes[lo].x, y: nodes[lo].y };
        const frac = (targetDist - cum[lo]) / segLen;
        return {
            x: nodes[lo].x + frac * (nodes[hi].x - nodes[lo].x),
            y: nodes[lo].y + frac * (nodes[hi].y - nodes[lo].y),
        };
    }

    /**
     * Return polyline coordinates following the spine between two t-values.
     * Includes interpolated start/end points and all spine nodes in between.
     * @param {number} tStart
     * @param {number} tEnd
     * @returns {Array<[number, number]>}
     */
    polylineInRange(tStart, tEnd) {
        const nodes = this.spineNodes;
        if (nodes.length < 2) return [];

        this._refreshCumLen();
        const totalLen = this._cumLen[nodes.length - 1] || 1;
        const dStart = tStart * totalLen;
        const dEnd = tEnd * totalLen;
        const cum = this._cumLen;

        const points = [];

        // Interpolated start point
        const sp = this.positionAt(tStart);
        points.push([sp.x, sp.y]);

        // All spine nodes within the range
        for (let i = 0; i < nodes.length; i++) {
            if (cum[i] > dStart && cum[i] < dEnd) {
                points.push([nodes[i].x, nodes[i].y]);
            }
        }

        // Interpolated end point
        const ep = this.positionAt(tEnd);
        points.push([ep.x, ep.y]);

        return points;
    }

    // ---------------------------------------------------------------
    // Bubble tracking
    // ---------------------------------------------------------------

    /**
     * Get unpopped bubbles within a t-range.
     * @param {number} tStart
     * @param {number} tEnd
     * @returns {Array} — subset of this.bubbles
     */
    bubblesInRange(tStart, tEnd) {
        return this.bubbles.filter(b =>
            b.t >= tStart && b.t <= tEnd && !this.poppedBubbles.has(b.id)
        );
    }

    // ---------------------------------------------------------------
    // Split / Merge
    // ---------------------------------------------------------------

    /**
     * Split a segment at a popped bubble.
     * @param {string} bubbleId
     * @param {number} tPosition — bubble's t on the chain [0,1]
     * @param {number} tWidth    — gap width in t-space
     * @param {string[]} sourceSegs — source segs of the popped bubble
     * @param {string[]} sinkSegs   — sink segs of the popped bubble
     * @returns {{ leftSegment, rightSegment, removedSegment }}
     */
    splitAtBubble(bubbleId, tPosition, tWidth, sourceSegs, sinkSegs) {
        this.poppedBubbles.add(bubbleId);

        const tStart = tPosition - tWidth / 2;
        const tEnd = tPosition + tWidth / 2;

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
        });

        // Create right segment: [tEnd, oldEnd]
        const rightSeg = new PolychainSegment({
            id: `${this.id}:${this.segments.length + 1}`,
            containerId: this.id,
            headSegs: sinkSegs.map(String),
            tailSegs: oldSeg.ends.tail,
            tRange: { start: tEnd, end: oldSeg.tRange.end },
            container: this,
        });

        // Replace old segment
        this.segments.splice(segIdx, 1, leftSeg, rightSeg);

        // Register new ends
        registry.registerAll(leftSeg.ends.head, leftSeg);
        registry.registerAll(leftSeg.ends.tail, leftSeg);
        registry.registerAll(rightSeg.ends.head, rightSeg);
        registry.registerAll(rightSeg.ends.tail, rightSeg);

        // Old segment's anchors should be removed from sim by caller
        const removedSegment = oldSeg;

        return { leftSegment: leftSeg, rightSegment: rightSeg, removedSegment };
    }

    /**
     * Merge segments back after unpop.
     * @param {string} bubbleId
     * @returns {{ mergedSegment, removedSegments }}
     */
    mergeAtBubble(bubbleId) {
        this.poppedBubbles.delete(bubbleId);

        // Find the two segments adjacent to the popped bubble's t-range
        // by looking for segments whose tRange endpoints meet at the gap
        const bubble = this.bubbles.find(b => b.id === bubbleId);
        if (!bubble) throw new Error(`Unknown bubble ${bubbleId}`);

        // Find segments where one's end and another's start bracket the bubble
        let leftSeg = null, rightSeg = null;
        for (const s of this.segments) {
            if (s.tRange.end <= bubble.t && (!leftSeg || s.tRange.end > leftSeg.tRange.end)) {
                leftSeg = s;
            }
            if (s.tRange.start >= bubble.t && (!rightSeg || s.tRange.start < rightSeg.tRange.start)) {
                rightSeg = s;
            }
        }
        if (!leftSeg || !rightSeg) throw new Error(`Cannot find segments around bubble ${bubbleId}`);

        // Unregister old ends
        registry.unregisterAll(leftSeg.ends.head);
        registry.unregisterAll(leftSeg.ends.tail);
        registry.unregisterAll(rightSeg.ends.head);
        registry.unregisterAll(rightSeg.ends.tail);

        // Create merged segment
        const mergedSeg = new PolychainSegment({
            id: `${this.id}:${this.segments.length}`,
            containerId: this.id,
            headSegs: leftSeg.ends.head,
            tailSegs: rightSeg.ends.tail,
            tRange: { start: leftSeg.tRange.start, end: rightSeg.tRange.end },
            container: this,
        });

        // Remove old, insert merged
        const leftIdx = this.segments.indexOf(leftSeg);
        const rightIdx = this.segments.indexOf(rightSeg);
        const removeIndices = [leftIdx, rightIdx].sort((a, b) => b - a);
        for (const idx of removeIndices) this.segments.splice(idx, 1);
        this.segments.splice(Math.min(leftIdx, rightIdx), 0, mergedSeg);

        // Register merged ends
        registry.registerAll(mergedSeg.ends.head, mergedSeg);
        registry.registerAll(mergedSeg.ends.tail, mergedSeg);

        return { mergedSegment: mergedSeg, removedSegments: [leftSeg, rightSeg] };
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    /** Collect all anchor nodes from all segments (for adding to force sim). */
    getAllAnchorNodes() {
        const nodes = [];
        for (const seg of this.segments) {
            nodes.push(seg.headAnchor, seg.tailAnchor);
        }
        return nodes;
    }

    /** Destroy all segments and clear registrations. */
    destroy() {
        for (const seg of this.segments) {
            registry.unregisterAll(seg.ends.head);
            registry.unregisterAll(seg.ends.tail);
        }
        this.segments = [];
        this.spineNodes = [];
        this.spineLinks = [];
        this.poppedBubbles.clear();
    }

    _createInitialSegment() {
        const seg = new PolychainSegment({
            id: this.id,
            containerId: this.id,
            headSegs: this.headSegs,
            tailSegs: this.tailSegs,
            tRange: { start: 0, end: 1 },
            container: this,
        });

        this.segments = [seg];
        registry.registerAll(this.headSegs, seg);
        registry.registerAll(this.tailSegs, seg);
    }

    /** Recompute cumulative arc lengths from live spine node positions. */
    _refreshCumLen() {
        const nodes = this.spineNodes;
        const n = nodes.length;
        if (this._cumLen.length < n) this._cumLen = new Float64Array(n);
        const cum = this._cumLen;
        cum[0] = 0;
        for (let i = 1; i < n; i++) {
            const dx = nodes[i].x - nodes[i - 1].x;
            const dy = nodes[i].y - nodes[i - 1].y;
            cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy);
        }
    }
}
