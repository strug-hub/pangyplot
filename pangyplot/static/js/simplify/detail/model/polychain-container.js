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

// ---------------------------------------------------------------
// Resampling helpers (self-contained to avoid circular imports)
// ---------------------------------------------------------------

const MIN_NODES = 2;

function _cumulativeLengths(pl) {
    const cumLen = [0];
    for (let i = 1; i < pl.length; i++) {
        cumLen.push(cumLen[i - 1] + Math.hypot(
            pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
    }
    return cumLen;
}

function _interpolateAtDist(pl, cumLen, d) {
    if (d <= 0) return [pl[0][0], pl[0][1]];
    if (d >= cumLen[cumLen.length - 1]) return [pl[pl.length - 1][0], pl[pl.length - 1][1]];
    let lo = 0, hi = cumLen.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cumLen[mid] <= d) lo = mid; else hi = mid;
    }
    const segLen = cumLen[hi] - cumLen[lo];
    const t = segLen > 0 ? (d - cumLen[lo]) / segLen : 0;
    return [
        pl[lo][0] + t * (pl[hi][0] - pl[lo][0]),
        pl[lo][1] + t * (pl[hi][1] - pl[lo][1]),
    ];
}

function _resamplePolyline(polyline, bpSpan) {
    if (!polyline || polyline.length < 2) return null;
    const bp = bpSpan || 1;
    const logBp = Math.log10(Math.max(bp, 10));
    const nTarget = Math.max(MIN_NODES, Math.round(logBp * logBp));
    const cumLen = _cumulativeLengths(polyline);
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return polyline;
    if (nTarget === polyline.length) return polyline;
    const samples = [polyline[0]];
    for (let i = 1; i < nTarget - 1; i++) {
        samples.push(_interpolateAtDist(polyline, cumLen, totalLen * i / (nTarget - 1)));
    }
    samples.push(polyline[polyline.length - 1]);
    return samples;
}

function _computeLoopFactor(pl) {
    if (!pl || pl.length < 3) return 0;
    const headToTail = Math.hypot(
        pl[pl.length - 1][0] - pl[0][0],
        pl[pl.length - 1][1] - pl[0][1]);
    let arcLen = 0;
    for (let i = 1; i < pl.length; i++) {
        arcLen += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
    }
    if (arcLen === 0) return 0;
    return Math.max(0, Math.min(1, 1 - headToTail / arcLen));
}

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

        /** Popped t-ranges: [{tStart, tEnd, bubbleId}] */
        this.poppedRanges = [];

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
        return this.bubbles.filter(b => {
            if (b.t < tStart || b.t > tEnd) return false;
            // Exclude bubbles within any popped range
            for (const pr of this.poppedRanges) {
                if (b.t >= pr.tStart && b.t <= pr.tEnd) return false;
            }
            return true;
        });
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
    /**
     * Split a segment at a popped bubble.
     *
     * If one side of the split is empty (no unpopped bubbles in that tRange),
     * that side does NOT become a PolychainSegment. Instead, its boundary seg
     * should be materialized as a SegmentObject by the caller. The return value
     * indicates which sides have segments and which have materializedSegs.
     *
     * @returns {{ leftSegment, rightSegment, removedSegment, materializeHead, materializeTail }}
     *   leftSegment/rightSegment: PolychainSegment or null if that side is empty
     *   materializeHead: string[] — source segs to materialize (if left side empty)
     *   materializeTail: string[] — sink segs to materialize (if right side empty)
     */
    splitAtBubble(bubbleId, tPosition, sourceSegs, sinkSegs) {
        // Find which segment covers this t
        const segIdx = this.segments.findIndex(
            s => s.tRange.start <= tPosition && s.tRange.end >= tPosition
        );
        if (segIdx === -1) throw new Error(`No segment covers t=${tPosition}`);
        const oldSeg = this.segments[segIdx];

        // Mark as popped — bubblesInRange will now exclude this bubble
        this.poppedRanges.push({ tStart: tPosition, tEnd: tPosition, bubbleId });

        // Find neighbor bubbles (nearest unpopped on each side)
        const leftBubbles = this.bubblesInRange(oldSeg.tRange.start, tPosition);
        const rightBubbles = this.bubblesInRange(tPosition, oldSeg.tRange.end);

        const leftNeighbor = leftBubbles.length > 0 ? leftBubbles[leftBubbles.length - 1] : null;
        const rightNeighbor = rightBubbles.length > 0 ? rightBubbles[0] : null;
        // Anchor at midpoint between popped bubble and neighbor — gives the
        // boundary segment visual space instead of sitting on the neighbor circle.
        const leftEnd = leftNeighbor ? (leftNeighbor.t + tPosition) / 2 : tPosition;
        const rightStart = rightNeighbor ? (rightNeighbor.t + tPosition) / 2 : tPosition;

        // Unregister old segment's ends
        registry.unregisterAll(oldSeg.ends.head);
        registry.unregisterAll(oldSeg.ends.tail);

        // Segment splits itself — reuses outer anchors, creates new inner ones
        const { left, right, newAnchors } = oldSeg.splitAt(
            bubbleId, sourceSegs, sinkSegs,
            leftEnd, rightStart,
            leftBubbles.length > 0, rightBubbles.length > 0
        );

        const result = {
            leftSegment: left,
            rightSegment: right,
            removedSegment: oldSeg,
            newAnchors,  // only the NEW inner anchors (outer ones reused)
            materializeHead: left ? [] : sourceSegs.map(String),
            materializeTail: right ? [] : sinkSegs.map(String),
        };

        // Replace old segment with new ones
        const newSegments = [];
        if (left) {
            newSegments.push(left);
            registry.registerAll(left.ends.head, left);
            registry.registerAll(left.ends.tail, left);
        }
        if (right) {
            newSegments.push(right);
            registry.registerAll(right.ends.head, right);
            registry.registerAll(right.ends.tail, right);
        }
        this.segments.splice(segIdx, 1, ...newSegments);

        return result;
    }

    /**
     * Merge segments back after unpop.
     * @param {string} bubbleId
     * @returns {{ mergedSegment, removedSegments }}
     */
    mergeAtBubble(bubbleId) {
        // Remove from popped ranges
        const prIdx = this.poppedRanges.findIndex(pr => pr.bubbleId === bubbleId);
        const poppedRange = prIdx !== -1 ? this.poppedRanges[prIdx] : null;
        if (prIdx !== -1) this.poppedRanges.splice(prIdx, 1);

        // Find the t-position of the popped bubble
        const tPos = poppedRange ? (poppedRange.tStart + poppedRange.tEnd) / 2 : null;
        if (tPos == null) throw new Error(`No popped range for bubble ${bubbleId}`);

        // Find segments where one's end and another's start bracket the bubble
        let leftSeg = null, rightSeg = null;
        for (const s of this.segments) {
            if (s.tRange.end <= tPos && (!leftSeg || s.tRange.end > leftSeg.tRange.end)) {
                leftSeg = s;
            }
            if (s.tRange.start >= tPos && (!rightSeg || s.tRange.start < rightSeg.tRange.start)) {
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
        this.poppedRanges = [];
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

    // ---------------------------------------------------------------
    // Static factory — create container from chain API data
    // ---------------------------------------------------------------

    /**
     * Create a PolychainContainer from /detail-tiles chain data.
     * The container creates its own spine nodes + links internally.
     *
     * @param {object} chain — chain from /detail-tiles response
     *   { id, polyline, sourceSegs, sinkSegs, bpSpan, polychainNodes?,
     *     bubbleIds?, bubblePositions?, bubble_t?, bubble_ids? }
     * @returns {PolychainContainer|null}
     */
    static fromChainData(chain) {
        const chainId = chain.id;

        // Resample polyline into spine sample points
        const samples = chain.polychainNodes || _resamplePolyline(chain.polyline, chain.bpSpan || chain.length);
        if (!samples || samples.length < 2) return null;

        const nSamples = samples.length;
        const loopFactor = _computeLoopFactor(chain.polyline);

        // Create spine nodes
        const spineNodes = [];
        for (let i = 0; i < nSamples; i++) {
            spineNodes.push({
                id: `pn_${chainId}_${i}`,
                iid: `pn_${chainId}_${i}`,
                x: samples[i][0],
                y: samples[i][1],
                homeX: samples[i][0],
                homeY: samples[i][1],
                chainId,
                isPolychainNode: true,
                nodeIndex: i,
                chainNodeCount: nSamples,
                loopFactor,
                radius: 0,
                width: 0,
            });
        }

        // Create spine links (sequential)
        let chainArcLen = 0;
        for (let i = 0; i < nSamples - 1; i++) {
            chainArcLen += Math.hypot(
                samples[i + 1][0] - samples[i][0],
                samples[i + 1][1] - samples[i][1]);
        }
        const uniformLen = chainArcLen / (nSamples - 1) || 1;
        const spineLinks = [];
        for (let i = 0; i < nSamples - 1; i++) {
            spineLinks.push({
                source: spineNodes[i],
                target: spineNodes[i + 1],
                isPolychainLink: true,
                isKinkLink: false,
                chainId,
                length: uniformLen,
                loopFactor,
                chainArcLen,
            });
        }

        // Normalize seg IDs
        const headSegs = (chain.sourceSegs || chain.source_segs || []).map(s =>
            String(s).startsWith('s') ? String(s) : `s${s}`);
        const tailSegs = (chain.sinkSegs || chain.sink_segs || []).map(s =>
            String(s).startsWith('s') ? String(s) : `s${s}`);

        // Build bubble metadata
        const bubbleIds = chain.bubbleIds || chain.bubble_ids || [];
        const bubblePositions = chain.bubblePositions || chain.bubble_t || [];
        if (bubblePositions.length > 0 && bubbleIds.length === 0) {
            console.warn(`[container] ${chainId}: bubble_t=${bubblePositions.length} but bubbleIds is empty`, chain);
        }
        const bubbles = [];
        for (let i = 0; i < bubblePositions.length; i++) {
            const id = i < bubbleIds.length && bubbleIds[i]
                ? (String(bubbleIds[i]).startsWith('b') ? String(bubbleIds[i]) : `b${bubbleIds[i]}`)
                : `_bubble_${chainId}_${i}`;
            bubbles.push({ id, t: bubblePositions[i] });
        }

        // Store loopFactor on chain object for parent-perp computation
        chain.loopFactor = loopFactor;

        return new PolychainContainer({
            id: chainId,
            spineNodes,
            spineLinks,
            headSegs,
            tailSegs,
            bubbles,
        });
    }
}
