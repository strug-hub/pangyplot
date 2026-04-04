/**
 * SimObject — abstract base class for all items in the force simulation.
 *
 * Every visual element (segment, bubble, polychain segment) is a SimObject.
 * The key abstraction: only `ends` are exposed to the link system.
 * `interior` is the object's own business — opaque to callers.
 */

const LINK_SCALE = 1;
const LINK_BASE_LENGTH = 10;
const SINGLE_NODE_BP_THRESH = 10;
const KINK_SIZE = 2000;
const MAX_KINKS = 20;

export function calculateNumberOfKinks(length) {
    if (length < SINGLE_NODE_BP_THRESH) return 1;
    return Math.min(Math.floor(length / KINK_SIZE) + 2, MAX_KINKS);
}

export function getKinkCoordinates(coords, kinks, i) {
    if (kinks === 1) {
        return {
            x: (coords.x1 + coords.x2) / 2,
            y: (coords.y1 + coords.y2) / 2
        };
    }
    const p = Math.max(0, Math.min(1, 1 - i / (kinks - 1)));
    return {
        x: p * coords.x1 + (1 - p) * coords.x2,
        y: p * coords.y1 + (1 - p) * coords.y2
    };
}

export function kinkLinkLength(seqLength) {
    return Math.min(seqLength / 100, 1000) * LINK_SCALE;
}

export { LINK_SCALE, LINK_BASE_LENGTH };

export class SimObject {
    /**
     * @param {string} id        — unique identifier (e.g. "s137", "b456", "c42:0")
     * @param {string|null} parentId — owning container ID (e.g. chain root ID)
     */
    constructor(id, parentId = null) {
        if (new.target === SimObject) {
            throw new Error('SimObject is abstract — use a subclass');
        }
        this.id = id;
        this.parentId = parentId;

        /**
         * Boundary segment IDs — the only "exposed" surface.
         * head: entry side (source segs), tail: exit side (sink segs).
         * For a simple segment, head and tail contain the same segId.
         * @type {{ head: string[], tail: string[] }}
         */
        this.ends = { head: [], tail: [] };

        /**
         * Content inside this object. NOT tracked by the registry.
         * Used only by the object itself for rendering and popping.
         * @type {any[]|null}
         */
        this.interior = null;

        /**
         * d3 force nodes this object owns in the simulation.
         * @type {object[]}
         */
        this.physicsNodes = [];

        /**
         * Internal d3 force links (e.g. kink-to-kink). NOT GFA links.
         * @type {object[]}
         */
        this.physicsLinks = [];
    }

    /**
     * Given a GFA link, return the d3 force node it should attach to.
     * The object inspects link.fromSegId/toSegId against its own ends
     * to determine which side is being connected, then returns the
     * appropriate physics node (strand-aware for kinked objects).
     *
     * @param {object} link — a GFA link with fromSegId, toSegId, fromStrand, toStrand
     * @returns {object|null} — d3 force node, or null if no match
     */
    resolveEnd(link) {
        throw new Error('resolveEnd() must be implemented by subclass');
    }

    /**
     * True if this GFA link goes from head to tail of THIS object —
     * i.e. it bypasses the interior (a deletion / source-sink bypass link).
     *
     * @param {object} link — a GFA link
     * @returns {boolean}
     */
    isDeletionLink(link) {
        const fromSeg = _stripPrefix(link.fromSegId ?? link.source);
        const toSeg = _stripPrefix(link.toSegId ?? link.target);
        const fromInHead = this.ends.head.includes(fromSeg);
        const fromInTail = this.ends.tail.includes(fromSeg);
        const toInHead = this.ends.head.includes(toSeg);
        const toInTail = this.ends.tail.includes(toSeg);
        return (fromInHead && toInTail) || (fromInTail && toInHead);
    }

    /**
     * Return drawing instructions for the batched renderer.
     * @returns {object[]} — array of RenderSpec objects
     */
    getRenderables() {
        return [];
    }

    /**
     * Does this object's ends contain the given segment ID?
     * Interior is opaque — only checks boundary.
     * @param {string} segId
     * @returns {boolean}
     */
    containsSeg(segId) {
        const id = _stripPrefix(segId);
        return this.ends.head.includes(id) || this.ends.tail.includes(id);
    }

    /**
     * Unregister all ends from the registry and clean up physics nodes.
     * @param {SegmentRegistry} registry
     */
    destroy(registry) {
        for (const segId of this.ends.head) registry.unregister(segId);
        for (const segId of this.ends.tail) registry.unregister(segId);
        this.physicsNodes = [];
        this.physicsLinks = [];
    }

    // --- Helpers for subclasses ---

    /**
     * Determine which side of this object a link's segment touches.
     * Returns "head", "tail", or null.
     * @param {string} segId — s-prefixed or bare segment ID
     * @returns {"head"|"tail"|null}
     */
    _whichEnd(segId) {
        const id = _stripPrefix(segId);
        if (this.ends.head.includes(id)) return 'head';
        if (this.ends.tail.includes(id)) return 'tail';
        return null;
    }

    /**
     * From a GFA link, figure out which segId belongs to this object
     * and which strand applies.
     * @param {object} link
     * @returns {{ segId: string, strand: string, side: "head"|"tail" }|null}
     */
    _matchLink(link) {
        const fromSeg = _stripPrefix(link.fromSegId ?? link.source);
        const toSeg = _stripPrefix(link.toSegId ?? link.target);

        let side = this._whichEnd(fromSeg);
        if (side) return { segId: fromSeg, strand: link.fromStrand || '+', side, role: 'source' };

        side = this._whichEnd(toSeg);
        if (side) return { segId: toSeg, strand: link.toStrand || '+', side, role: 'target' };

        return null;
    }
}

function _stripPrefix(id) {
    if (typeof id === 'string' && (id.startsWith('s') || id.startsWith('b'))) {
        const rest = id.slice(1);
        if (/^\d+$/.test(rest)) return id; // keep s-prefix for segment IDs
    }
    return String(id);
}
