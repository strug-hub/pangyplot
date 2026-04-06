import { describe, it, expect, beforeEach } from 'vitest';
import { SimObject } from '@model/sim-object.js';
import { SegmentObject } from '@model/segment-object.js';
import { BubbleObject } from '@model/bubble-object.js';
import * as registry from '@model/segment-registry.js';

// --- SimObject abstract ---

describe('SimObject', () => {
    it('cannot be instantiated directly', () => {
        expect(() => new SimObject('test')).toThrow('abstract');
    });
});

// --- SegmentObject ---

describe('SegmentObject', () => {
    const makeSegment = (opts = {}) => new SegmentObject({
        id: 's100',
        length: 500,
        coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
        gcCount: 100,
        nCount: 0,
        ranges: [[5, 10]],
        ...opts,
    });

    it('sets head and tail ends to the same segment ID', () => {
        const seg = makeSegment();
        expect(seg.ends.head).toEqual(['s100']);
        expect(seg.ends.tail).toEqual(['s100']);
    });

    it('has null interior', () => {
        expect(makeSegment().interior).toBeNull();
    });

    it('creates correct number of kink nodes for small segments', () => {
        const seg = makeSegment({ length: 5 });  // < 10bp threshold
        expect(seg.physicsNodes).toHaveLength(1);
        expect(seg.physicsLinks).toHaveLength(0);
    });

    it('creates 2 kink nodes for segments 10-2000bp', () => {
        const seg = makeSegment({ length: 500 });
        expect(seg.physicsNodes).toHaveLength(2);
        expect(seg.physicsLinks).toHaveLength(1);
    });

    it('creates more kinks for longer segments', () => {
        const seg = makeSegment({ length: 5000 });
        // floor(5000/2000) + 2 = 4
        expect(seg.physicsNodes).toHaveLength(4);
        expect(seg.physicsLinks).toHaveLength(3);
    });

    it('caps kinks at 20', () => {
        const seg = makeSegment({ length: 100000 });
        expect(seg.physicsNodes).toHaveLength(20);
    });

    it('kink nodes have correct iid format', () => {
        const seg = makeSegment({ length: 500 });
        expect(seg.physicsNodes[0].iid).toBe('s100#0');
        expect(seg.physicsNodes[1].iid).toBe('s100#1');
    });

    it('kink nodes have head() and tail() accessors', () => {
        const seg = makeSegment({ length: 500 });
        expect(seg.physicsNodes[0].head()).toBe('s100#0');
        expect(seg.physicsNodes[0].tail()).toBe('s100#1');
    });

    it('kink nodes have renderer compat fields', () => {
        const seg = makeSegment({ length: 500, gcCount: 42 });
        const node = seg.physicsNodes[0];
        expect(node.record).toBeDefined();
        expect(node.record.seqLength).toBe(500);
        expect(node.record.gcCount).toBe(42);
        expect(node.type).toBe('segment');
        expect(node.class).toBe('node');
        expect(node.width).toBe(5);
        expect(node.isRef).toBe(true);
    });

    it('kink nodes have simObject back-reference', () => {
        const seg = makeSegment();
        expect(seg.physicsNodes[0].simObject).toBe(seg);
    });

    it('kink links have isKinkLink flag', () => {
        const seg = makeSegment({ length: 500 });
        expect(seg.physicsLinks[0].isKinkLink).toBe(true);
    });

    describe('resolveEnd', () => {
        it('returns tail kink for + strand', () => {
            const seg = makeSegment({ length: 5000 }); // 4 kinks
            const link = { source: 's100', target: 's200', fromStrand: '+', toStrand: '+' };
            const node = seg.resolveEnd(link);
            expect(node).toBe(seg.tailNode);
            expect(node.iid).toBe('s100#3');
        });

        it('returns head kink for - strand', () => {
            const seg = makeSegment({ length: 5000 });
            const link = { source: 's100', target: 's200', fromStrand: '-', toStrand: '+' };
            const node = seg.resolveEnd(link);
            expect(node).toBe(seg.headNode);
            expect(node.iid).toBe('s100#0');
        });

        it('returns null for unrelated segments', () => {
            const seg = makeSegment();
            const link = { source: 's999', target: 's888', fromStrand: '+', toStrand: '+' };
            expect(seg.resolveEnd(link)).toBeNull();
        });

        it('matches via target field too', () => {
            const seg = makeSegment();
            // target role, "-" strand → tailNode
            const link = { source: 's200', target: 's100', fromStrand: '+', toStrand: '-' };
            const node = seg.resolveEnd(link);
            expect(node).toBe(seg.tailNode);
        });
    });

    describe('containsSeg', () => {
        it('returns true for own segment ID', () => {
            expect(makeSegment().containsSeg('s100')).toBe(true);
        });

        it('returns false for other segments', () => {
            expect(makeSegment().containsSeg('s999')).toBe(false);
        });
    });

    describe('fromApiNode', () => {
        it('creates from API response', () => {
            const seg = SegmentObject.fromApiNode({
                id: 's42', type: 'segment', length: 300,
                x1: 0, y1: 0, x2: 5, y2: 0,
                gc_count: 50, n_count: 2, seq: 'ATCG',
                ranges: [[1, 3]],
            });
            expect(seg.id).toBe('s42');
            expect(seg.seqLength).toBe(300);
            expect(seg.seq).toBe('ATCG');
        });
    });
});

// --- BubbleObject ---

describe('BubbleObject', () => {
    const makeBubble = (opts = {}) => new BubbleObject({
        id: 'b456',
        sourceSegs: ['s10', 's11'],
        sinkSegs: ['s20'],
        length: 1000,
        coords: { x1: 0, y1: 0, x2: 20, y2: 0 },
        gcCount: 200,
        nCount: 5,
        subtype: 'superbubble',
        size: 8,
        ranges: [[3, 7]],
        insideSegs: ['s12', 's13', 's14'],
        childBubbles: [{ id: 'b789' }],
        ...opts,
    });

    it('sets head ends to source segs and tail ends to sink segs', () => {
        const b = makeBubble();
        expect(b.ends.head).toEqual(['s10', 's11']);
        expect(b.ends.tail).toEqual(['s20']);
    });

    it('stores interior (opaque to link system)', () => {
        const b = makeBubble();
        expect(b.interior.insideSegs).toEqual(['s12', 's13', 's14']);
        expect(b.interior.childBubbles).toHaveLength(1);
    });

    it('creates kink nodes', () => {
        const b = makeBubble({ length: 1000 });
        // floor(1000/2000) + 2 = 2
        expect(b.physicsNodes).toHaveLength(2);
        expect(b.physicsNodes[0].type).toBe('bubble');
    });

    it('kink nodes have size field for color system', () => {
        const b = makeBubble();
        expect(b.physicsNodes[0].size).toBe(8);
    });

    describe('resolveEnd', () => {
        it('returns tail kink for source seg + strand match', () => {
            const b = makeBubble({ length: 5000 });
            // s10 is source (role=source), strand "+" → tail
            const link = { source: 's10', target: 's50', fromStrand: '+', toStrand: '+' };
            const node = b.resolveEnd(link);
            expect(node).toBe(b.tailNode);
        });

        it('returns head kink for target seg + strand match', () => {
            const b = makeBubble({ length: 5000 });
            // s20 is target (role=target), strand "+" → head
            const link = { source: 's50', target: 's20', fromStrand: '+', toStrand: '+' };
            const node = b.resolveEnd(link);
            expect(node).toBe(b.headNode);
        });
    });

    describe('fromApiNode', () => {
        it('creates from API response with s-prefixing', () => {
            const b = BubbleObject.fromApiNode({
                id: 'b99', type: 'bubble', length: 2000,
                x1: 0, y1: 0, x2: 10, y2: 0,
                gc_count: 100, n_count: 0,
                subtype: 'simple', size: 3,
                ranges: [], siblings: [null, null],
                source_segs: [10, 11], sink_segs: [20],
                inside_segs: [12, 13],
                parent: null, chain: 'c5', chain_step: 2,
            });
            expect(b.ends.head).toEqual(['s10', 's11']);
            expect(b.ends.tail).toEqual(['s20']);
            expect(b.interior.insideSegs).toEqual(['s12', 's13']);
        });
    });
});

// --- SegmentRegistry ---

describe('SegmentRegistry', () => {
    beforeEach(() => registry.clear());

    it('registers and resolves a segment', () => {
        const seg = new SegmentObject({
            id: 's100', length: 100,
            coords: { x1: 0, y1: 0, x2: 5, y2: 0 },
        });
        registry.register('s100', seg);
        expect(registry.resolve('s100')).toBe(seg);
    });

    it('normalizes IDs to s-prefix', () => {
        const seg = new SegmentObject({
            id: 's100', length: 100,
            coords: { x1: 0, y1: 0, x2: 5, y2: 0 },
        });
        registry.register('100', seg);
        expect(registry.resolve('s100')).toBe(seg);
        expect(registry.resolve('100')).toBe(seg);
    });

    it('returns null for unregistered segments', () => {
        expect(registry.resolve('s999')).toBeNull();
    });

    it('last-write-wins on duplicate registration', () => {
        const seg1 = new SegmentObject({ id: 's1', length: 100, coords: { x1: 0, y1: 0, x2: 5, y2: 0 } });
        const seg2 = new SegmentObject({ id: 's2', length: 200, coords: { x1: 0, y1: 0, x2: 5, y2: 0 } });
        registry.register('s100', seg1);
        registry.register('s100', seg2);
        expect(registry.resolve('s100')).toBe(seg2);
    });

    it('registerAll registers multiple IDs to same object', () => {
        const seg = new SegmentObject({ id: 's1', length: 100, coords: { x1: 0, y1: 0, x2: 5, y2: 0 } });
        registry.registerAll(['s10', 's11', 's12'], seg);
        expect(registry.resolve('s10')).toBe(seg);
        expect(registry.resolve('s11')).toBe(seg);
        expect(registry.resolve('s12')).toBe(seg);
    });

    it('unregister removes a segment', () => {
        const seg = new SegmentObject({ id: 's1', length: 100, coords: { x1: 0, y1: 0, x2: 5, y2: 0 } });
        registry.register('s100', seg);
        registry.unregister('s100');
        expect(registry.resolve('s100')).toBeNull();
    });

    it('unregisterAll removes multiple', () => {
        const seg = new SegmentObject({ id: 's1', length: 100, coords: { x1: 0, y1: 0, x2: 5, y2: 0 } });
        registry.registerAll(['s10', 's11'], seg);
        registry.unregisterAll(['s10', 's11']);
        expect(registry.resolve('s10')).toBeNull();
        expect(registry.resolve('s11')).toBeNull();
    });

    it('resolveForLink returns d3 node via object.resolveEnd', () => {
        const seg = new SegmentObject({
            id: 's100', length: 500,
            coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
        });
        registry.register('s100', seg);
        const link = { source: 's100', target: 's200', fromStrand: '+', toStrand: '+' };
        const node = registry.resolveForLink(link, 's100');
        expect(node).toBe(seg.tailNode);
    });

    it('resolveForLink returns null for unregistered segment', () => {
        const link = { source: 's999', target: 's888', fromStrand: '+', toStrand: '+' };
        expect(registry.resolveForLink(link, 's999')).toBeNull();
    });

    it('clear removes all entries', () => {
        const seg = new SegmentObject({ id: 's1', length: 100, coords: { x1: 0, y1: 0, x2: 5, y2: 0 } });
        registry.registerAll(['s1', 's2', 's3'], seg);
        expect(registry.size()).toBe(3);
        registry.clear();
        expect(registry.size()).toBe(0);
    });
});
