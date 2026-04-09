/**
 * Tests for the bp-based gene annotation system.
 *
 * Covers: mixGeneColor, refBp computation, computeGeneOverlaps,
 * getGeneRenderables for SegmentObject, BubbleObject, PolychainSegment.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mixGeneColor } from '@model/sim-object.js';
import { SegmentObject } from '@model/segment-object.js';
import { BubbleObject } from '@model/bubble-object.js';
import { PolychainSegment } from '@model/polychain-segment.js';
import { PolychainContainer } from '@model/polychain-container.js';
import * as registry from '@model/segment-registry.js';

beforeEach(() => {
    registry.clear();
    PolychainSegment.resetAnchorCounter();
});

// --- Helpers ---

function makeGenePin(name, startBp, endBp, color = '#ff0000') {
    return { name, startBp, endBp, color };
}

function makeSegment(opts = {}) {
    return new SegmentObject({
        id: 's100',
        length: 500,
        coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
        gcCount: 100,
        nCount: 0,
        ranges: [[5, 10]],
        ...opts,
    });
}

function makeBubble(opts = {}) {
    return new BubbleObject({
        id: 'b456',
        sourceSegs: ['s10'],
        sinkSegs: ['s20'],
        length: 500,
        coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
        gcCount: 100,
        nCount: 0,
        subtype: 'simple',
        size: 3,
        ranges: [[3, 7]],
        ...opts,
    });
}

function makeSpineNodes(count = 5) {
    const nodes = [];
    for (let i = 0; i < count; i++) {
        nodes.push({
            id: `pn_c42_${i}`, iid: `pn_c42_${i}`,
            x: i * 100, y: 0,
            homeX: i * 100, homeY: 0,
            chainId: 'c42',
        });
    }
    return nodes;
}

function makeSpineLinks(nodes) {
    const links = [];
    for (let i = 0; i < nodes.length - 1; i++) {
        links.push({ source: nodes[i], target: nodes[i + 1] });
    }
    return links;
}

function makeContainer(opts = {}) {
    const nodes = opts.spineNodes || makeSpineNodes();
    const links = opts.spineLinks || makeSpineLinks(nodes);
    return new PolychainContainer({
        id: 'c42',
        spineNodes: nodes,
        spineLinks: links,
        headSegs: ['s10'],
        tailSegs: ['s20'],
        bubbles: [],
        ...opts,
    });
}

// ---------------------------------------------------------------------------
// mixGeneColor
// ---------------------------------------------------------------------------

describe('mixGeneColor', () => {
    it('returns a hex color string', () => {
        const c = mixGeneColor('#ff0000');
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('mixes toward background at default alpha', () => {
        // #ff0000 mixed with #1b1b1b at 0.55
        const c = mixGeneColor('#ff0000', 0.55);
        // Red channel: 27 + (255 - 27) * 0.55 ≈ 152
        expect(parseInt(c.slice(1, 3), 16)).toBeGreaterThan(100);
        expect(parseInt(c.slice(1, 3), 16)).toBeLessThan(200);
        // Green channel should stay near background
        expect(parseInt(c.slice(3, 5), 16)).toBeLessThan(30);
    });

    it('returns background color at alpha=0', () => {
        const c = mixGeneColor('#ff0000', 0);
        expect(c).toBe('#1b1b1b');
    });

    it('returns gene color at alpha=1', () => {
        const c = mixGeneColor('#ff0000', 1);
        expect(c).toBe('#ff0000');
    });
});

// ---------------------------------------------------------------------------
// refBp — SegmentObject
// ---------------------------------------------------------------------------

describe('SegmentObject refBp', () => {
    it('is set when bpStart and bpEnd provided', () => {
        const seg = makeSegment({ bpStart: 1000, bpEnd: 2000 });
        expect(seg.refBp).toEqual({ start: 1000, end: 2000 });
    });

    it('is null when bp not provided', () => {
        const seg = makeSegment();
        expect(seg.refBp).toBeNull();
    });

    it('is null when only bpStart provided', () => {
        const seg = makeSegment({ bpStart: 1000 });
        expect(seg.refBp).toBeNull();
    });

    it('is set via fromApiNode when backend sends bp', () => {
        const seg = SegmentObject.fromApiNode({
            id: 's42', length: 300,
            x1: 0, y1: 0, x2: 5, y2: 0,
            gc_count: 50, n_count: 0,
            ranges: [[1, 3]],
            bp_start: 5000, bp_end: 5300,
        });
        expect(seg.refBp).toEqual({ start: 5000, end: 5300 });
    });

    it('is null via fromApiNode when backend omits bp', () => {
        const seg = SegmentObject.fromApiNode({
            id: 's42', length: 300,
            x1: 0, y1: 0, x2: 5, y2: 0,
            gc_count: 50, n_count: 0,
            ranges: [],
        });
        expect(seg.refBp).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// refBp — BubbleObject
// ---------------------------------------------------------------------------

describe('BubbleObject refBp', () => {
    it('is set when bpStart and bpEnd provided', () => {
        const b = makeBubble({ bpStart: 3000, bpEnd: 4000 });
        expect(b.refBp).toEqual({ start: 3000, end: 4000 });
    });

    it('is null when bp not provided', () => {
        expect(makeBubble().refBp).toBeNull();
    });

    it('is set via fromApiNode', () => {
        const b = BubbleObject.fromApiNode({
            id: 'b99', type: 'bubble', length: 2000,
            x1: 0, y1: 0, x2: 10, y2: 0,
            gc_count: 100, n_count: 0,
            subtype: 'simple', size: 3,
            ranges: [], siblings: [null, null],
            source_segs: [10], sink_segs: [20],
            bp_start: 8000, bp_end: 10000,
        });
        expect(b.refBp).toEqual({ start: 8000, end: 10000 });
    });
});

// ---------------------------------------------------------------------------
// refBp — PolychainSegment
// ---------------------------------------------------------------------------

describe('PolychainSegment refBp', () => {
    it('computes refBp from container bpHead/bpTail (forward chain)', () => {
        const c = makeContainer({ bpHead: 1000, bpTail: 5000 });
        const seg = c.segments[0]; // full chain, tRange [0, 1]
        expect(seg.refBp).toEqual({ start: 1000, end: 5000 });
    });

    it('computes refBp from container bpHead/bpTail (reversed chain)', () => {
        const c = makeContainer({ bpHead: 5000, bpTail: 1000 });
        const seg = c.segments[0];
        expect(seg.refBp).toEqual({ start: 1000, end: 5000 });
    });

    it('is null when container has no bp', () => {
        const c = makeContainer();
        const seg = c.segments[0];
        expect(seg.refBp).toBeNull();
    });

    it('computes partial refBp for split segments (forward)', () => {
        const c = makeContainer({
            bpHead: 0, bpTail: 10000,
            bubbles: [
                { id: 'b1', t: 0.2 },
                { id: 'b2', t: 0.5 },
                { id: 'b3', t: 0.8 },
            ],
        });
        // Split at middle bubble (t=0.5)
        c.splitAtBubble('b2', 0.5, ['s30'], ['s31']);
        expect(c.segments).toHaveLength(2);

        const left = c.segments[0];
        const right = c.segments[1];
        // left tRange ~[0, 0.35], right tRange ~[0.65, 1]
        expect(left.refBp.start).toBeLessThan(right.refBp.start);
        expect(left.refBp.end).toBeLessThan(right.refBp.end);
    });
});

// ---------------------------------------------------------------------------
// computeGeneOverlaps
// ---------------------------------------------------------------------------

describe('computeGeneOverlaps', () => {
    it('finds overlapping genes for ref segment', () => {
        const seg = makeSegment({ bpStart: 1000, bpEnd: 2000 });
        const pins = [
            makeGenePin('GENE_A', 500, 1500),   // overlaps
            makeGenePin('GENE_B', 2500, 3000),   // no overlap
            makeGenePin('GENE_C', 1800, 2200),   // overlaps
        ];
        seg.computeGeneOverlaps(pins);
        expect(seg._geneOverlaps).toHaveLength(2);
        expect(seg._geneOverlaps.map(g => g.name)).toEqual(['GENE_A', 'GENE_C']);
    });

    it('returns empty for alt path segment (no refBp)', () => {
        const seg = makeSegment(); // no bpStart/bpEnd
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 500, 1500)]);
        expect(seg._geneOverlaps).toEqual([]);
    });

    it('returns empty when no genes overlap', () => {
        const seg = makeSegment({ bpStart: 1000, bpEnd: 2000 });
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 3000, 4000)]);
        expect(seg._geneOverlaps).toEqual([]);
    });

    it('handles exact boundary (non-overlapping)', () => {
        const seg = makeSegment({ bpStart: 1000, bpEnd: 2000 });
        // Gene ends exactly where segment starts — no overlap
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 500, 1000)]);
        expect(seg._geneOverlaps).toEqual([]);
    });

    it('works on BubbleObject too', () => {
        const b = makeBubble({ bpStart: 5000, bpEnd: 6000 });
        b.computeGeneOverlaps([makeGenePin('GENE_A', 5500, 7000)]);
        expect(b._geneOverlaps).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// getGeneRenderables — SegmentObject
// ---------------------------------------------------------------------------

describe('SegmentObject getGeneRenderables', () => {
    it('returns empty when no gene overlaps', () => {
        const seg = makeSegment({ bpStart: 1000, bpEnd: 2000 });
        seg.computeGeneOverlaps([]);
        expect(seg.getGeneRenderables()).toEqual([]);
    });

    it('returns empty for alt path (no refBp)', () => {
        const seg = makeSegment();
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 0, 99999)]);
        expect(seg.getGeneRenderables()).toEqual([]);
    });

    it('returns circle halo for single-kink segment', () => {
        const seg = makeSegment({ length: 5, bpStart: 1000, bpEnd: 1005 }); // 1 kink
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 500, 1500)]);
        const specs = seg.getGeneRenderables();
        expect(specs.length).toBeGreaterThan(0);
        expect(specs[0].type).toBe('circle');
        expect(specs[0].geneName).toBe('GENE_A');
        expect(specs[0].layer).toBe('gene-halo');
    });

    it('returns polyline halo for multi-kink segment', () => {
        // 4 kinks, bp range 0-8000
        const seg = makeSegment({ length: 5000, bpStart: 0, bpEnd: 8000 });
        // Gene covers first half: 0-4000 → polyline clipped to that range
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 0, 4000)]);
        const specs = seg.getGeneRenderables();
        expect(specs.length).toBe(1);
        expect(specs[0].type).toBe('polyline');
        expect(specs[0].points.length).toBeGreaterThanOrEqual(2);
    });

    it('includes geneName on all specs', () => {
        const seg = makeSegment({ length: 5, bpStart: 1000, bpEnd: 1005 });
        seg.computeGeneOverlaps([makeGenePin('MY_GENE', 500, 1500)]);
        for (const spec of seg.getGeneRenderables()) {
            expect(spec.geneName).toBe('MY_GENE');
        }
    });

    it('handles multiple overlapping genes', () => {
        const seg = makeSegment({ length: 5, bpStart: 1000, bpEnd: 2000 });
        seg.computeGeneOverlaps([
            makeGenePin('GENE_A', 500, 1500, '#ff0000'),
            makeGenePin('GENE_B', 1800, 2500, '#00ff00'),
        ]);
        const specs = seg.getGeneRenderables();
        const names = [...new Set(specs.map(s => s.geneName))];
        expect(names).toContain('GENE_A');
        expect(names).toContain('GENE_B');
    });

    it('assigns increasing overlapIdx for overlapping genes', () => {
        const seg = makeSegment({ length: 5, bpStart: 1000, bpEnd: 2000 });
        seg.computeGeneOverlaps([
            makeGenePin('GENE_A', 500, 2500, '#ff0000'),
            makeGenePin('GENE_B', 500, 2500, '#00ff00'),
            makeGenePin('GENE_C', 500, 2500, '#0000ff'),
        ]);
        const specs = seg.getGeneRenderables();
        const idxByGene = {};
        for (const s of specs) idxByGene[s.geneName] = s.overlapIdx;
        expect(idxByGene['GENE_A']).toBe(0);
        expect(idxByGene['GENE_B']).toBe(1);
        expect(idxByGene['GENE_C']).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// getGeneRenderables — BubbleObject
// ---------------------------------------------------------------------------

describe('BubbleObject getGeneRenderables', () => {
    it('returns circle halo for single-kink bubble', () => {
        const b = makeBubble({ length: 5, bpStart: 1000, bpEnd: 1005 });
        b.computeGeneOverlaps([makeGenePin('GENE_A', 500, 1500)]);
        const specs = b.getGeneRenderables();
        expect(specs.length).toBeGreaterThan(0);
        expect(specs[0].type).toBe('circle');
        expect(specs[0].geneName).toBe('GENE_A');
    });
});

// ---------------------------------------------------------------------------
// getGeneRenderables — PolychainSegment
// ---------------------------------------------------------------------------

describe('PolychainSegment getGeneRenderables', () => {
    it('returns polyline halo for overlapping gene', () => {
        const c = makeContainer({ bpHead: 0, bpTail: 10000 });
        const seg = c.segments[0];
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 2000, 8000)]);
        const specs = seg.getGeneRenderables();
        expect(specs.length).toBe(1);
        expect(specs[0].type).toBe('polyline');
        expect(specs[0].geneName).toBe('GENE_A');
        expect(specs[0].points.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty when no refBp', () => {
        const c = makeContainer(); // no bp
        const seg = c.segments[0];
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 0, 99999)]);
        expect(seg.getGeneRenderables()).toEqual([]);
    });

    it('returns empty when gene does not overlap', () => {
        const c = makeContainer({ bpHead: 0, bpTail: 10000 });
        const seg = c.segments[0];
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 20000, 30000)]);
        expect(seg.getGeneRenderables()).toEqual([]);
    });

    it('handles reversed chain correctly', () => {
        const c = makeContainer({ bpHead: 10000, bpTail: 0 });
        const seg = c.segments[0];
        // Gene at low bp end (0-3000) should produce a polyline
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 0, 3000)]);
        const specs = seg.getGeneRenderables();
        expect(specs.length).toBe(1);
        expect(specs[0].type).toBe('polyline');
    });

    it('sub-polyline covers partial chain for partial gene overlap', () => {
        const c = makeContainer({ bpHead: 0, bpTail: 10000 });
        const seg = c.segments[0];
        // Gene covers first 20% of chain
        seg.computeGeneOverlaps([makeGenePin('GENE_A', 0, 2000)]);
        const specs = seg.getGeneRenderables();
        expect(specs.length).toBe(1);
        // Sub-polyline should be shorter than the full polyline
        const fullPl = seg.getPolyline();
        expect(specs[0].points.length).toBeLessThanOrEqual(fullPl.length);
    });
});
