/**
 * PolychainSegment — a visible portion of a chain in the force simulation.
 *
 * Represents one contiguous visible section of a polychain. Has two anchor
 * d3 nodes (headAnchor, tailAnchor) that serve as physical connection points
 * for GFA links. The anchors are invisible — positioned by the PolychainContainer
 * each frame at the neighboring bubble circle locations.
 *
 * Does NOT own spine physics nodes — it reads positions from the parent
 * PolychainContainer's spine. Its physicsNodes are only the two anchors.
 *
 * interior holds bubble circle metadata for rendering (not tracked by registry).
 */

import { SimObject } from './sim-object.js';

let _anchorIdCounter = 0;

function _createAnchorNode(id, x, y) {
    return {
        id,
        iid: id,
        simObject: null, // set after construction
        class: 'node',
        type: 'anchor',
        x, y,
        fx: x, fy: y,   // pinned
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
     * @param {object} [opts.headPos]    — { x, y } initial head anchor position
     * @param {object} [opts.tailPos]    — { x, y } initial tail anchor position
     * @param {Array}  [opts.bubbleMeta] — bubble circle metadata for this segment's range
     */
    constructor(opts) {
        super(opts.id, opts.containerId);

        this.ends = {
            head: (opts.headSegs || []).map(String),
            tail: (opts.tailSegs || []).map(String),
        };

        this.tRange = opts.tRange || { start: 0, end: 1 };
        this.container = opts.container;

        // Interior: bubble circle metadata for rendering
        this.interior = opts.bubbleMeta || [];

        // Create anchor nodes
        const hp = opts.headPos || { x: 0, y: 0 };
        const tp = opts.tailPos || { x: 0, y: 0 };
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
    }

    resolveEnd(link) {
        const match = this._matchLink(link);
        if (!match) return null;
        return match.side === 'head' ? this.headAnchor : this.tailAnchor;
    }

    getRenderables() {
        // Bubble circles at interpolated t-positions within tRange.
        // Polyline drawing is handled by PolychainContainer, not the segment.
        const specs = [];
        for (const bubble of this.interior) {
            if (bubble.x == null || bubble.y == null) continue;
            specs.push({
                type: 'circle',
                x: bubble.x,
                y: bubble.y,
                r: bubble.radius ?? 3,
                colorKey: bubble,
                layer: 'bubble-circle',
                alpha: bubble.alpha ?? 1,
            });
        }
        return specs;
    }

    /**
     * Update anchor positions. Called by PolychainContainer each frame.
     * @param {{ x: number, y: number }} headPos
     * @param {{ x: number, y: number }} tailPos
     */
    updateAnchors(headPos, tailPos) {
        this.headAnchor.fx = headPos.x;
        this.headAnchor.fy = headPos.y;
        this.headAnchor.x = headPos.x;
        this.headAnchor.y = headPos.y;
        this.tailAnchor.fx = tailPos.x;
        this.tailAnchor.fy = tailPos.y;
        this.tailAnchor.x = tailPos.x;
        this.tailAnchor.y = tailPos.y;
    }

    /**
     * Reset the anchor ID counter (for testing).
     */
    static resetAnchorCounter() {
        _anchorIdCounter = 0;
    }
}
