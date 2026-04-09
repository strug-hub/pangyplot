/**
 * SegmentObject — a single GFA segment in the force simulation.
 *
 * Handles its own kink count (1-20 physics nodes based on bp length).
 * ends.head and ends.tail both contain the same segment ID — a segment
 * is its own boundary on both sides. Strand determines which kink node
 * a link attaches to (head kink for "-", tail kink for "+").
 */

import { SimObject, calculateNumberOfKinks, getKinkCoordinates, kinkLinkLength, LINK_SCALE,
    mixGeneColor, extractGeneSubPolyline } from './sim-object.js';

export class SegmentObject extends SimObject {
    /**
     * @param {object} opts
     * @param {string} opts.id          — e.g. "s137"
     * @param {string|null} opts.parentId — owning container chain ID
     * @param {number} opts.segId       — numeric segment ID (or s-prefixed string)
     * @param {number} opts.length      — sequence length in bp
     * @param {object} opts.coords      — {x1, y1, x2, y2} ODGI layout coordinates
     * @param {number} opts.gcCount
     * @param {number} opts.nCount
     * @param {string|null} opts.seq    — sequence string (optional)
     * @param {Array} opts.ranges       — genomic step ranges [[start, end], ...]
     * @param {object} [opts.record]    — original NodeRecord (if available, for color)
     */
    constructor(opts) {
        super(opts.id, opts.parentId);

        const segId = String(opts.id);
        this.ends = { head: [segId], tail: [segId] };
        this.interior = null;

        this.segId = segId;
        this.seqLength = opts.length;
        this.coords = opts.coords;
        this.gcCount = opts.gcCount ?? 0;
        this.nCount = opts.nCount ?? 0;
        this.seq = opts.seq ?? null;
        this.ranges = opts.ranges ?? [];
        this.record = opts.record ?? null;

        this.refBp = (opts.bpStart != null && opts.bpEnd != null)
            ? { start: opts.bpStart, end: opts.bpEnd }
            : null;

        // Record-like object for color/rendering compat (used if no original record)
        this._recordCompat = this.record ?? {
            id: this.id,
            type: 'segment',
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
                type: 'segment',
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
                type: 'segment',
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

        // Source and target have opposite kink selection:
        //   Source: "+" → tail (link leaves from end), "-" → head
        //   Target: "+" → head (link arrives at start), "-" → tail
        if (match.role === 'source') {
            return match.strand === '+' ? this.tailNode : this.headNode;
        } else {
            return match.strand === '+' ? this.headNode : this.tailNode;
        }
    }

    getGeneRenderables() {
        if (!this._geneOverlaps || this._geneOverlaps.length === 0) return [];
        const specs = [];
        const bpSpan = this.refBp.end - this.refBp.start;
        for (let gi = 0; gi < this._geneOverlaps.length; gi++) {
            const pin = this._geneOverlaps[gi];
            const color = mixGeneColor(pin.color);
            if (this._kinkCount === 1) {
                const n = this.physicsNodes[0];
                specs.push({ type: 'circle', x: n.x, y: n.y, r: n.width * 1.75,
                    color, geneName: pin.name, layer: 'gene-halo', overlapIdx: gi });
            } else {
                // Build polyline from kink positions, clip to gene bp range
                const tStart = Math.max(0, (pin.startBp - this.refBp.start) / bpSpan);
                const tEnd = Math.min(1, (pin.endBp - this.refBp.start) / bpSpan);
                if (tEnd - tStart < 0.001) continue;
                const kinkPl = this.physicsNodes.map(n => [n.x, n.y]);
                const sub = extractGeneSubPolyline(kinkPl, tStart, tEnd);
                if (!sub || sub.length < 2) continue;
                specs.push({ type: 'polyline', points: sub, color,
                    geneName: pin.name, layer: 'gene-halo', overlapIdx: gi });
            }
        }
        return specs;
    }

    getRenderables() {
        const specs = [];

        // Kink circles (nodes)
        for (const n of this.physicsNodes) {
            specs.push({
                type: 'circle',
                x: n.x, y: n.y,
                r: n.width / 2,
                colorKey: this.record ?? this,
                layer: 'node',
            });
        }

        // Kink line segments (between consecutive kinks)
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
     * Create a SegmentObject from a backend API node response.
     * @param {object} apiNode — node from /pop response
     * @param {string|null} parentId — owning chain ID
     * @returns {SegmentObject}
     */
    static fromApiNode(apiNode, parentId = null) {
        return new SegmentObject({
            id: apiNode.id,
            parentId,
            segId: apiNode.id,
            length: apiNode.length,
            coords: { x1: apiNode.x1, y1: apiNode.y1, x2: apiNode.x2, y2: apiNode.y2 },
            gcCount: apiNode.gc_count,
            nCount: apiNode.n_count,
            seq: apiNode.seq ?? null,
            ranges: apiNode.ranges ?? [],
            bpStart: apiNode.bp_start ?? null,
            bpEnd: apiNode.bp_end ?? null,
        });
    }
}
