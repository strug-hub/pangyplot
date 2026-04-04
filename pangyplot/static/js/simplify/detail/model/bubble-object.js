/**
 * BubbleObject — a collapsed bubble (poppable) in the force simulation.
 *
 * ends.head = source segment IDs, ends.tail = sink segment IDs.
 * interior holds child bubble/segment IDs from the API — used only
 * for rendering and popping, invisible to the link system.
 *
 * Like SegmentObject, creates kink nodes for its visual representation.
 * A deletion link is any GFA link that goes from head to tail of this
 * same object (source→sink bypass).
 */

import { SimObject, calculateNumberOfKinks, getKinkCoordinates, kinkLinkLength, LINK_SCALE }
    from './sim-object.js';

export class BubbleObject extends SimObject {
    /**
     * @param {object} opts
     * @param {string} opts.id           — e.g. "b456"
     * @param {string|null} opts.parentId — owning container chain ID
     * @param {string[]} opts.sourceSegs  — source segment IDs (head ends)
     * @param {string[]} opts.sinkSegs    — sink segment IDs (tail ends)
     * @param {number} opts.length        — sequence length in bp
     * @param {object} opts.coords        — {x1, y1, x2, y2} ODGI layout coordinates
     * @param {number} opts.gcCount
     * @param {number} opts.nCount
     * @param {string} opts.subtype       — "simple", "superbubble", etc.
     * @param {number} opts.size          — count of inside segments
     * @param {Array}  opts.ranges        — genomic step ranges
     * @param {Array}  [opts.insideSegs]  — interior segment IDs (for the object's own use)
     * @param {Array}  [opts.childBubbles] — child bubble IDs
     * @param {number|null} [opts.parent] — parent bubble ID
     * @param {string|null} [opts.chain]  — chain ID
     * @param {number|null} [opts.chainStep]
     * @param {Array}  [opts.siblings]    — [leftSibId, rightSibId]
     * @param {object} [opts.record]      — original NodeRecord (for color)
     */
    constructor(opts) {
        super(opts.id, opts.parentId);

        this.ends = {
            head: (opts.sourceSegs || []).map(String),
            tail: (opts.sinkSegs || []).map(String),
        };

        // Interior: child IDs + inside segs. Opaque to link system.
        this.interior = {
            insideSegs: opts.insideSegs ?? [],
            childBubbles: opts.childBubbles ?? [],
        };

        this.seqLength = opts.length;
        this.coords = opts.coords;
        this.gcCount = opts.gcCount ?? 0;
        this.nCount = opts.nCount ?? 0;
        this.subtype = opts.subtype ?? 'simple';
        this.size = opts.size ?? 0;
        this.ranges = opts.ranges ?? [];
        this.parentBubble = opts.parent ?? null;
        this.chain = opts.chain ?? null;
        this.chainStep = opts.chainStep ?? null;
        this.siblings = opts.siblings ?? [null, null];
        this.record = opts.record ?? null;

        // Record-like object for color/rendering compat
        this._recordCompat = this.record ?? {
            id: this.id,
            type: 'bubble',
            seqLength: this.seqLength,
            gcCount: this.gcCount,
            nCount: this.nCount,
            ranges: this.ranges,
            start: this.ranges.length > 0 ? this.ranges[0][0] : null,
            end: this.ranges.length > 0 ? this.ranges[this.ranges.length - 1][1] : null,
        };

        this._buildKinks();
    }

    _buildKinks() {
        const kinkCount = calculateNumberOfKinks(this.seqLength);
        this._kinkCount = kinkCount;
        const nodes = [];
        const links = [];

        for (let i = 0; i < kinkCount; i++) {
            const { x, y } = getKinkCoordinates(this.coords, kinkCount, i);
            const id = this.id;
            const kc = kinkCount;
            nodes.push({
                id,
                iid: `${id}#${i}`,
                idx: i,
                simObject: this,
                class: 'node',
                type: 'bubble',
                head: () => `${id}#0`,
                tail: () => `${id}#${kc - 1}`,
                x, y,
                homeX: x,
                homeY: y,
                kinks: kinkCount,
                isEnd: (i === 0 || i === kinkCount - 1),
                isSingleton: kinkCount === 1,
                isRef: this.ranges.length > 0,
                isVisible: true,
                isDrawn: true,
                width: 5,
                // compat fields for renderer/color system
                record: this._recordCompat,
                seqLength: this.seqLength,
                size: this.size,
            });
        }

        for (let i = 1; i < kinkCount; i++) {
            const sourceIid = `${this.id}#${i - 1}`;
            const targetIid = `${this.id}#${i}`;
            links.push({
                class: 'node',
                id: this.id,
                iid: `${sourceIid}+${targetIid}+`,
                source: sourceIid,
                target: targetIid,
                sourceIid: sourceIid,
                targetIid: targetIid,
                sourceId: this.id,
                targetId: this.id,
                simObject: this,
                type: 'bubble',
                isKinkLink: true,
                isRef: this.ranges.length > 0,
                isDrawn: true,
                width: 5,
                length: kinkLinkLength(this.seqLength),
            });
        }

        this.physicsNodes = nodes;
        this.physicsLinks = links;
    }

    /** Head kink node (first). */
    get headNode() { return this.physicsNodes[0]; }

    /** Tail kink node (last). */
    get tailNode() { return this.physicsNodes[this.physicsNodes.length - 1]; }

    resolveEnd(link) {
        const match = this._matchLink(link);
        if (!match) return null;

        // Same source/target logic as SegmentObject:
        //   Source: "+" → tail, "-" → head
        //   Target: "+" → head, "-" → tail
        if (match.role === 'source') {
            return match.strand === '+' ? this.tailNode : this.headNode;
        } else {
            return match.strand === '+' ? this.headNode : this.tailNode;
        }
        return this.headNode;
    }

    getRenderables() {
        const specs = [];

        for (const n of this.physicsNodes) {
            specs.push({
                type: 'circle',
                x: n.x, y: n.y,
                r: n.width / 2,
                colorKey: this.record ?? this,
                layer: 'node',
            });
        }

        for (const l of this.physicsLinks) {
            const src = this.physicsNodes[l.source?.idx ?? 0];
            const tgt = this.physicsNodes[l.target?.idx ?? 1];
            if (!src || !tgt) continue;
            specs.push({
                type: 'line',
                x1: src.x, y1: src.y,
                x2: tgt.x, y2: tgt.y,
                colorKey: this.record ?? this,
                layer: 'kink',
            });
        }

        return specs;
    }

    /**
     * Create a BubbleObject from a backend API node response.
     * @param {object} apiNode — node from /pop response (type === "bubble")
     * @param {string|null} parentId — owning chain ID
     * @returns {BubbleObject}
     */
    static fromApiNode(apiNode, parentId = null) {
        return new BubbleObject({
            id: apiNode.id,
            parentId,
            sourceSegs: (apiNode.source_segs || []).map(s => `s${s}`),
            sinkSegs: (apiNode.sink_segs || []).map(s => `s${s}`),
            length: apiNode.length,
            coords: { x1: apiNode.x1, y1: apiNode.y1, x2: apiNode.x2, y2: apiNode.y2 },
            gcCount: apiNode.gc_count,
            nCount: apiNode.n_count,
            subtype: apiNode.subtype,
            size: apiNode.size,
            ranges: apiNode.ranges ?? [],
            insideSegs: (apiNode.inside_segs || []).map(s => `s${s}`),
            parent: apiNode.parent,
            chain: apiNode.chain,
            chainStep: apiNode.chain_step,
            siblings: apiNode.siblings,
        });
    }
}
