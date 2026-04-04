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

import { SimObject } from './sim-object.js';

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
     * Get bubble circle positions for unpopped bubbles in this segment's range.
     * @returns {Array<{id, x, y, t, ...}>}
     */
    getBubbleCircles() {
        if (!this.container) return [];
        const bubbles = this.container.bubblesInRange(this.tRange.start, this.tRange.end);
        return bubbles.map(b => {
            const pos = this.container.positionAt(b.t);
            return { ...b, x: pos.x, y: pos.y };
        });
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
    // Testing
    // ---------------------------------------------------------------

    static resetAnchorCounter() {
        _anchorIdCounter = 0;
    }
}
