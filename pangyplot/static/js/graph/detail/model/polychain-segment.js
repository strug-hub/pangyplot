/**
 * PolychainSegment — a visible portion of a chain in the force simulation.
 *
 * Represents one contiguous visible section of a polychain. Has two anchor
 * d3 nodes (headAnchor, tailAnchor) that serve as physical connection points
 * for GFA links. Anchors ARE in the D3 sim.
 *
 * Does NOT own spine physics nodes — it pulls positions from the parent
 * PolychainContainer via container.positionAt(t) and container.polylineInRange().
 *
 * Knows its t-range and which bubbles fall within that range.
 * Handles its own rendering (polyline + bubble circles) and anchor positioning.
 */

import { SimObject, mixGeneColor } from './sim-object.js';
import { pcSettings } from '../engines/forces/pc-settings.js';

/** Extract a sub-polyline for fractional range [tStart, tEnd]. */
function _extractSubPolyline(pl, tStart, tEnd) {
    if (!pl || pl.length < 2) return null;
    // Cumulative arc lengths
    const cum = [0];
    for (let i = 1; i < pl.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    if (total === 0) return null;

    const dStart = tStart * total;
    const dEnd = tEnd * total;

    function interpAt(d) {
        if (d <= 0) return [pl[0][0], pl[0][1]];
        if (d >= total) return [pl[pl.length - 1][0], pl[pl.length - 1][1]];
        let lo = 0, hi = cum.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (cum[mid] <= d) lo = mid; else hi = mid;
        }
        const seg = cum[hi] - cum[lo];
        const t = seg > 0 ? (d - cum[lo]) / seg : 0;
        return [pl[lo][0] + t * (pl[hi][0] - pl[lo][0]),
                pl[lo][1] + t * (pl[hi][1] - pl[lo][1])];
    }

    const sub = [interpAt(dStart)];
    for (let i = 1; i < pl.length - 1; i++) {
        if (cum[i] > dStart && cum[i] < dEnd) sub.push([pl[i][0], pl[i][1]]);
    }
    sub.push(interpAt(dEnd));
    return sub;
}

let _anchorIdCounter = 0;

function _createAnchorNode(id, x, y) {
    return {
        id,
        iid: id,
        simObject: null,
        class: 'node',
        type: 'anchor',
        x, y,
        fx: x, fy: y,
        homeX: x, homeY: y,
        isAnchor: true,
        isVisible: false,
        isDrawn: false,
        width: 0,
    };
}

export class PolychainSegment extends SimObject {
    /**
     * @param {object} opts
     * @param {string} opts.id           — e.g. "c42" or "c42:0"
     * @param {string} opts.containerId  — root chain ID (parent container)
     * @param {string[]} opts.headSegs   — source segment IDs for head end
     * @param {string[]} opts.tailSegs   — sink segment IDs for tail end
     * @param {object} opts.tRange       — { start: number, end: number } normalized [0,1]
     * @param {object} opts.container    — back-reference to PolychainContainer
     */
    constructor(opts) {
        super(opts.id, opts.containerId);

        this.ends = {
            head: (opts.headSegs || []).map(String),
            tail: (opts.tailSegs || []).map(String),
        };

        this.tRange = opts.tRange || { start: 0, end: 1 };
        this.container = opts.container;

        // Create anchor nodes at initial positions from container
        const hp = this.container
            ? this.container.positionAt(this.tRange.start)
            : { x: 0, y: 0 };
        const tp = this.container
            ? this.container.positionAt(this.tRange.end)
            : { x: 0, y: 0 };

        this.headAnchor = _createAnchorNode(
            `anchor_${opts.containerId}_${_anchorIdCounter++}_H`, hp.x, hp.y
        );
        this.tailAnchor = _createAnchorNode(
            `anchor_${opts.containerId}_${_anchorIdCounter++}_T`, tp.x, tp.y
        );
        this.headAnchor.simObject = this;
        this.tailAnchor.simObject = this;

        this.physicsNodes = [this.headAnchor, this.tailAnchor];
        this.physicsLinks = [];

        // Interior: bubble metadata is pulled from container on demand
        this.interior = null;

        // Compute refBp from container's chain-level bp + this segment's t-range
        this._computeRefBp();
    }

    _computeRefBp() {
        this.refBp = null;
        this._bpReversed = false;
        const c = this.container;
        if (!c || c.bpHead == null || c.bpTail == null) return;
        const bpH = c.bpHead;
        const bpT = c.bpTail;
        const reversed = bpH > bpT;
        this._bpReversed = reversed;
        const bpMin = Math.min(bpH, bpT);
        const bpMax = Math.max(bpH, bpT);
        const bpSpan = bpMax - bpMin;
        if (bpSpan <= 0) return;
        const tS = this.tRange.start, tE = this.tRange.end;
        if (reversed) {
            this.refBp = {
                start: bpMin + (1 - tE) * bpSpan,
                end:   bpMin + (1 - tS) * bpSpan,
            };
        } else {
            this.refBp = {
                start: bpMin + tS * bpSpan,
                end:   bpMin + tE * bpSpan,
            };
        }
    }

    // ---------------------------------------------------------------
    // Link resolution
    // ---------------------------------------------------------------

    resolveEnd(link) {
        const match = this._matchLink(link);
        if (!match) return null;
        return match.side === 'head' ? this.headAnchor : this.tailAnchor;
    }

    // ---------------------------------------------------------------
    // Per-frame: update anchors by pulling from container
    // ---------------------------------------------------------------

    /**
     * Update anchor positions from the container's live spine.
     * Call each force tick.
     */
    updateAnchors() {
        if (!this.container) return;
        const hp = this.container.positionAt(this.tRange.start);
        const tp = this.container.positionAt(this.tRange.end);
        this.headAnchor.fx = hp.x;
        this.headAnchor.fy = hp.y;
        this.headAnchor.x = hp.x;
        this.headAnchor.y = hp.y;
        this.tailAnchor.fx = tp.x;
        this.tailAnchor.fy = tp.y;
        this.tailAnchor.x = tp.x;
        this.tailAnchor.y = tp.y;
    }

    // ---------------------------------------------------------------
    // Rendering queries — pull from container
    // ---------------------------------------------------------------

    /**
     * Get the polyline for this segment's visible range.
     * @returns {Array<[number, number]>}
     */
    getPolyline() {
        if (!this.container) return [];
        return this.container.polylineInRange(this.tRange.start, this.tRange.end);
    }

    /**
     * Get bubble circles for unpopped bubbles in this segment's range.
     * Combines: position from container, metadata from bubble-meta-cache,
     * threshold + color object computed at render time.
     *
     * @returns {Array<{id, x, y, t, threshold, colorObj, meta}>}
     */
    /**
     * @param {object} [metaStore] — bubble-meta-cache store for this chain
     *   (pass getBubbleStore(chainId) from the caller)
     */
    getBubbleCircles(metaStore) {
        if (!this.container) return [];
        const bubbles = this.container.bubblesInRange(this.tRange.start, this.tRange.end);
        if (bubbles.length === 0) return [];

        // Build metadata lookup from the cache store.
        // Match by ID first, fall back to matching by closest t-position
        // (container may have placeholder IDs when bubble_ids wasn't available).
        const metaById = new Map();
        const metaByT = [];
        if (metaStore?.bubbles) {
            for (const b of metaStore.bubbles) {
                metaById.set(b.id, b);
                metaByT.push(b);
            }
        }

        const result = bubbles.map(b => {
            const pos = this.container.positionAt(b.t);
            // Try ID match, then closest t-position match
            let meta = metaById.get(b.id) || null;
            if (!meta && metaByT.length > 0) {
                let bestDist = Infinity;
                for (const m of metaByT) {
                    const d = Math.abs((m.t ?? 0) - b.t);
                    if (d < bestDist) { bestDist = d; meta = m; }
                }
            }
            const length = meta?.length ?? 0;

            // Threshold: compute from bubble length, scaled by graph density
            const LOG50 = Math.log10(50);
            const RANGE_INV = 1 / (Math.log10(100050) - LOG50);
            const ds = pcSettings.dataScale;
            const threshold = length <= 0 ? 20 * ds
                : Math.min(400 * ds, 20 * ds + (Math.log10(length + 50) - LOG50) * RANGE_INV * 380 * ds);

            // Color object: built from metadata for getNodeColor()
            const colorObj = {
                type: 'bubble',
                size: meta?.size ?? 0,
                isRef: meta?.is_ref ?? false,
                record: {
                    seqLength: length,
                    gcCount: meta?.gc_count ?? 0,
                    start: meta?.bp_start ?? null,
                    end: meta?.bp_end ?? null,
                },
            };

            return {
                id: b.id, x: pos.x, y: pos.y, t: b.t,
                threshold, colorObj, meta,
            };
        });
        this._lastBubbleCircles = result;
        return result;
    }

    getGeneRenderables() {
        if (!this._geneOverlaps || this._geneOverlaps.length === 0) return [];
        const pl = this.getPolyline();
        if (pl.length < 2) return [];
        const bpSpan = this.refBp.end - this.refBp.start;
        if (bpSpan <= 0) return [];
        const specs = [];
        for (const pin of this._geneOverlaps) {
            // Map gene bp range to [0,1] fraction within this segment's bp range
            let tStart = Math.max(0, (pin.startBp - this.refBp.start) / bpSpan);
            let tEnd = Math.min(1, (pin.endBp - this.refBp.start) / bpSpan);
            if (tEnd - tStart < 0.001) continue;
            // Reversed chain: polyline runs opposite to bp direction
            if (this._bpReversed) {
                const flipped0 = 1 - tEnd;
                const flipped1 = 1 - tStart;
                tStart = flipped0;
                tEnd = flipped1;
            }
            const sub = _extractSubPolyline(pl, tStart, tEnd);
            if (!sub || sub.length < 2) continue;
            const color = mixGeneColor(pin.color);
            specs.push({ type: 'polyline', points: sub, color,
                geneName: pin.name, layer: 'gene-halo' });
        }
        return specs;
    }

    /**
     * Return drawing instructions for the batched renderer.
     * Includes polyline + bubble circles.
     */
    getRenderables() {
        const specs = [];

        // Polyline for this segment's visible range
        const polyline = this.getPolyline();
        if (polyline.length >= 2) {
            specs.push({
                type: 'polyline',
                points: polyline,
                colorKey: this,
                layer: 'chain',
            });
        }

        // Bubble circles
        for (const b of this.getBubbleCircles()) {
            specs.push({
                type: 'circle',
                x: b.x,
                y: b.y,
                r: b.radius ?? 3,
                colorKey: b,
                layer: 'bubble-circle',
                alpha: b.alpha ?? 1,
            });
        }

        return specs;
    }

    // ---------------------------------------------------------------
    // Split
    // ---------------------------------------------------------------

    /**
     * Split this segment at a popped bubble. Reuses outer anchors so
     * existing links stay valid. Only creates new inner anchors at the gap.
     *
     * @param {string} bubbleId
     * @param {number} tPosition — bubble's t
     * @param {string[]} sourceSegs — source segs of the popped bubble
     * @param {string[]} sinkSegs — sink segs of the popped bubble
     * @param {number} leftEnd — t for left segment's tail (left neighbor bubble's t)
     * @param {number} rightStart — t for right segment's head (right neighbor bubble's t)
     * @param {boolean} hasLeft — whether left side has unpopped bubbles
     * @param {boolean} hasRight — whether right side has unpopped bubbles
     * @returns {{ left, right, newAnchors }}
     */
    splitAt(bubbleId, sourceSegs, sinkSegs, leftEnd, rightStart, hasLeft, hasRight) {
        let left = null, right = null;
        const newAnchors = [];

        if (hasLeft) {
            // New inner tailAnchor for left segment (at gap boundary)
            const tailPos = this.container.positionAt(leftEnd);
            const innerTailAnchor = _createAnchorNode(
                `anchor_${this.parentId}_${_anchorIdCounter++}_T`,
                tailPos.x, tailPos.y
            );
            innerTailAnchor.simObject = null; // set below

            left = new PolychainSegment({
                id: `${this.parentId}:${_anchorIdCounter}`,
                containerId: this.parentId,
                headSegs: this.ends.head,
                tailSegs: sourceSegs.map(String),
                tRange: { start: this.tRange.start, end: leftEnd },
                container: this.container,
            });
            // Reuse outer headAnchor (same d3 node — links stay valid)
            left.headAnchor = this.headAnchor;
            left.headAnchor.simObject = left;
            // Use new inner tailAnchor
            left.tailAnchor = innerTailAnchor;
            left.tailAnchor.simObject = left;
            left.physicsNodes = [left.headAnchor, left.tailAnchor];

            newAnchors.push(innerTailAnchor);
        }

        if (hasRight) {
            // New inner headAnchor for right segment (at gap boundary)
            const headPos = this.container.positionAt(rightStart);
            const innerHeadAnchor = _createAnchorNode(
                `anchor_${this.parentId}_${_anchorIdCounter++}_H`,
                headPos.x, headPos.y
            );
            innerHeadAnchor.simObject = null; // set below

            right = new PolychainSegment({
                id: `${this.parentId}:${_anchorIdCounter}`,
                containerId: this.parentId,
                headSegs: sinkSegs.map(String),
                tailSegs: this.ends.tail,
                tRange: { start: rightStart, end: this.tRange.end },
                container: this.container,
            });
            // Use new inner headAnchor
            right.headAnchor = innerHeadAnchor;
            right.headAnchor.simObject = right;
            // Reuse outer tailAnchor (same d3 node — links stay valid)
            right.tailAnchor = this.tailAnchor;
            right.tailAnchor.simObject = right;
            right.physicsNodes = [right.headAnchor, right.tailAnchor];

            newAnchors.push(innerHeadAnchor);
        }

        return { left, right, newAnchors };
    }

    // ---------------------------------------------------------------
    // Testing
    // ---------------------------------------------------------------

    static resetAnchorCounter() {
        _anchorIdCounter = 0;
    }
}
