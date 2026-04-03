import { describe, it, expect, beforeEach } from 'vitest';
import { PolychainSegment } from '@model/polychain-segment.js';
import { PolychainContainer } from '@model/polychain-container.js';
import * as registry from '@model/segment-registry.js';

beforeEach(() => {
    registry.clear();
    PolychainSegment.resetAnchorCounter();
});

// --- PolychainSegment ---

describe('PolychainSegment', () => {
    const makeSegment = (opts = {}) => new PolychainSegment({
        id: 'c42',
        containerId: 'c42',
        headSegs: ['s10', 's11'],
        tailSegs: ['s20'],
        tRange: { start: 0, end: 1 },
        container: null,
        headPos: { x: 0, y: 0 },
        tailPos: { x: 100, y: 0 },
        ...opts,
    });

    it('sets ends from head/tail segs', () => {
        const seg = makeSegment();
        expect(seg.ends.head).toEqual(['s10', 's11']);
        expect(seg.ends.tail).toEqual(['s20']);
    });

    it('has two anchor physics nodes', () => {
        const seg = makeSegment();
        expect(seg.physicsNodes).toHaveLength(2);
        expect(seg.headAnchor).toBe(seg.physicsNodes[0]);
        expect(seg.tailAnchor).toBe(seg.physicsNodes[1]);
    });

    it('anchors are pinned (fx/fy set)', () => {
        const seg = makeSegment();
        expect(seg.headAnchor.fx).toBe(0);
        expect(seg.headAnchor.fy).toBe(0);
        expect(seg.tailAnchor.fx).toBe(100);
        expect(seg.tailAnchor.fy).toBe(0);
    });

    it('anchors are invisible', () => {
        const seg = makeSegment();
        expect(seg.headAnchor.isAnchor).toBe(true);
        expect(seg.headAnchor.isVisible).toBe(false);
        expect(seg.headAnchor.isDrawn).toBe(false);
    });

    it('anchors have simObject back-reference', () => {
        const seg = makeSegment();
        expect(seg.headAnchor.simObject).toBe(seg);
        expect(seg.tailAnchor.simObject).toBe(seg);
    });

    it('has no physics links', () => {
        expect(makeSegment().physicsLinks).toHaveLength(0);
    });

    describe('resolveEnd', () => {
        it('returns headAnchor for head seg match', () => {
            const seg = makeSegment();
            const link = { source: 's10', target: 's50', fromStrand: '+', toStrand: '+' };
            expect(seg.resolveEnd(link)).toBe(seg.headAnchor);
        });

        it('returns tailAnchor for tail seg match', () => {
            const seg = makeSegment();
            const link = { source: 's50', target: 's20', fromStrand: '+', toStrand: '+' };
            expect(seg.resolveEnd(link)).toBe(seg.tailAnchor);
        });

        it('returns null for unrelated segments', () => {
            const seg = makeSegment();
            const link = { source: 's999', target: 's888', fromStrand: '+', toStrand: '+' };
            expect(seg.resolveEnd(link)).toBeNull();
        });
    });

    describe('updateAnchors', () => {
        it('updates anchor positions', () => {
            const seg = makeSegment();
            seg.updateAnchors({ x: 50, y: 10 }, { x: 150, y: 20 });
            expect(seg.headAnchor.fx).toBe(50);
            expect(seg.headAnchor.fy).toBe(10);
            expect(seg.headAnchor.x).toBe(50);
            expect(seg.tailAnchor.fx).toBe(150);
            expect(seg.tailAnchor.x).toBe(150);
        });
    });

    describe('getRenderables', () => {
        it('returns bubble circle specs from interior', () => {
            const seg = makeSegment({
                bubbleMeta: [
                    { id: 'b1', t: 0.5, x: 50, y: 5, radius: 3, alpha: 1 },
                    { id: 'b2', t: 0.8, x: 80, y: 3, radius: 2, alpha: 0.7 },
                ],
            });
            const specs = seg.getRenderables();
            expect(specs).toHaveLength(2);
            expect(specs[0].type).toBe('circle');
            expect(specs[0].layer).toBe('bubble-circle');
            expect(specs[0].x).toBe(50);
            expect(specs[1].alpha).toBe(0.7);
        });

        it('skips bubbles without positions', () => {
            const seg = makeSegment({
                bubbleMeta: [{ id: 'b1', t: 0.5 }],
            });
            expect(seg.getRenderables()).toHaveLength(0);
        });
    });
});

// --- PolychainContainer ---

describe('PolychainContainer', () => {
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

    const makeContainer = (opts = {}) => {
        const nodes = opts.spineNodes || makeSpineNodes();
        const links = opts.spineLinks || makeSpineLinks(nodes);
        return new PolychainContainer({
            id: 'c42',
            spineNodes: nodes,
            spineLinks: links,
            headSegs: ['s10'],
            tailSegs: ['s20'],
            ...opts,
        });
    };

    it('creates with one initial segment', () => {
        const c = makeContainer();
        expect(c.segments).toHaveLength(1);
        expect(c.segments[0].tRange).toEqual({ start: 0, end: 1 });
    });

    it('initial segment has head and tail ends', () => {
        const c = makeContainer();
        expect(c.segments[0].ends.head).toEqual(['s10']);
        expect(c.segments[0].ends.tail).toEqual(['s20']);
    });

    it('registers initial segment ends in registry', () => {
        const c = makeContainer();
        expect(registry.resolve('s10')).toBe(c.segments[0]);
        expect(registry.resolve('s20')).toBe(c.segments[0]);
    });

    it('tags spine nodes as isSpineNode', () => {
        const c = makeContainer();
        for (const n of c.spineNodes) {
            expect(n.isSpineNode).toBe(true);
            expect(n.chainId).toBe('c42');
        }
    });

    it('tags spine links as isSpineLink', () => {
        const c = makeContainer();
        for (const l of c.spineLinks) {
            expect(l.isSpineLink).toBe(true);
        }
    });

    describe('getSpinePositionAt', () => {
        it('returns first node at t=0', () => {
            const c = makeContainer();
            const pos = c.getSpinePositionAt(0);
            expect(pos.x).toBe(0);
            expect(pos.y).toBe(0);
        });

        it('returns last node at t=1', () => {
            const c = makeContainer();
            const pos = c.getSpinePositionAt(1);
            expect(pos.x).toBe(400);
            expect(pos.y).toBe(0);
        });

        it('interpolates at t=0.5', () => {
            const c = makeContainer();
            const pos = c.getSpinePositionAt(0.5);
            expect(pos.x).toBeCloseTo(200, 0);
            expect(pos.y).toBeCloseTo(0, 0);
        });

        it('handles single-node spine', () => {
            const nodes = [{ id: 'pn_0', iid: 'pn_0', x: 50, y: 10, chainId: 'c1' }];
            const c = new PolychainContainer({
                id: 'c1', spineNodes: nodes, spineLinks: [],
                headSegs: ['s1'], tailSegs: ['s2'],
            });
            const pos = c.getSpinePositionAt(0.5);
            expect(pos.x).toBe(50);
        });
    });

    describe('updateAnchors', () => {
        it('updates all segment anchors from spine positions', () => {
            const c = makeContainer();
            c.updateAnchors();
            const seg = c.segments[0];
            // t=0 → spine node 0 (x=0), t=1 → spine node 4 (x=400)
            expect(seg.headAnchor.fx).toBeCloseTo(0, 0);
            expect(seg.tailAnchor.fx).toBeCloseTo(400, 0);
        });
    });

    describe('splitAtBubble', () => {
        it('splits into two segments', () => {
            const c = makeContainer();
            const result = c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments).toHaveLength(2);
            expect(result.leftSegment).toBe(c.segments[0]);
            expect(result.rightSegment).toBe(c.segments[1]);
        });

        it('left segment covers [0, 0.45] and right covers [0.55, 1]', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments[0].tRange.start).toBeCloseTo(0);
            expect(c.segments[0].tRange.end).toBeCloseTo(0.45);
            expect(c.segments[1].tRange.start).toBeCloseTo(0.55);
            expect(c.segments[1].tRange.end).toBeCloseTo(1);
        });

        it('preserves outer ends, assigns inner ends to source/sink', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments[0].ends.head).toEqual(['s10']);   // original head
            expect(c.segments[0].ends.tail).toEqual(['s30']);   // source segs
            expect(c.segments[1].ends.head).toEqual(['s31']);   // sink segs
            expect(c.segments[1].ends.tail).toEqual(['s20']);   // original tail
        });

        it('adds a render mask', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.renderMasks).toHaveLength(1);
            expect(c.renderMasks[0].bubbleId).toBe('b7');
            expect(c.renderMasks[0].tStart).toBeCloseTo(0.45);
            expect(c.renderMasks[0].tEnd).toBeCloseTo(0.55);
        });

        it('registers new segment ends in registry', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(registry.resolve('s30')).toBe(c.segments[0]);
            expect(registry.resolve('s31')).toBe(c.segments[1]);
            expect(registry.resolve('s10')).toBe(c.segments[0]);
            expect(registry.resolve('s20')).toBe(c.segments[1]);
        });

        it('creates new anchor nodes for split segments', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments[0].physicsNodes).toHaveLength(2);
            expect(c.segments[1].physicsNodes).toHaveLength(2);
        });
    });

    describe('mergeAtBubble', () => {
        it('merges two segments back into one', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments).toHaveLength(2);

            const result = c.mergeAtBubble('b7');
            expect(c.segments).toHaveLength(1);
            expect(result.removedSegments).toHaveLength(2);
        });

        it('restores original tRange', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            c.mergeAtBubble('b7');
            expect(c.segments[0].tRange.start).toBeCloseTo(0);
            expect(c.segments[0].tRange.end).toBeCloseTo(1);
        });

        it('restores original ends', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            c.mergeAtBubble('b7');
            expect(c.segments[0].ends.head).toEqual(['s10']);
            expect(c.segments[0].ends.tail).toEqual(['s20']);
        });

        it('removes the render mask', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            c.mergeAtBubble('b7');
            expect(c.renderMasks).toHaveLength(0);
        });

        it('re-registers merged segment ends', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            c.mergeAtBubble('b7');
            expect(registry.resolve('s10')).toBe(c.segments[0]);
            expect(registry.resolve('s20')).toBe(c.segments[0]);
        });
    });

    describe('multiple splits', () => {
        it('handles two non-adjacent splits', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.3, 0.05, ['s30'], ['s31']);
            c.splitAtBubble('b8', 0.7, 0.05, ['s40'], ['s41']);
            expect(c.segments).toHaveLength(3);
            expect(c.renderMasks).toHaveLength(2);
        });

        it('merges in reverse order', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.3, 0.05, ['s30'], ['s31']);
            c.splitAtBubble('b8', 0.7, 0.05, ['s40'], ['s41']);
            c.mergeAtBubble('b8');
            expect(c.segments).toHaveLength(2);
            c.mergeAtBubble('b7');
            expect(c.segments).toHaveLength(1);
        });
    });

    describe('getRenderables', () => {
        it('returns polyline specs for full chain', () => {
            const c = makeContainer();
            const specs = c.getRenderables();
            expect(specs).toHaveLength(1);
            expect(specs[0].type).toBe('polyline');
            expect(specs[0].layer).toBe('chain');
            expect(specs[0].points.length).toBeGreaterThanOrEqual(2);
        });

        it('returns two polyline specs after split', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            const specs = c.getRenderables();
            expect(specs).toHaveLength(2);
            for (const s of specs) {
                expect(s.type).toBe('polyline');
            }
        });
    });

    describe('getAllAnchorNodes', () => {
        it('returns 2 anchors for unsplit chain', () => {
            const c = makeContainer();
            expect(c.getAllAnchorNodes()).toHaveLength(2);
        });

        it('returns 4 anchors after one split', () => {
            const c = makeContainer();
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.getAllAnchorNodes()).toHaveLength(4);
        });
    });

    describe('destroy', () => {
        it('clears all segments and registry entries', () => {
            const c = makeContainer();
            c.destroy();
            expect(c.segments).toHaveLength(0);
            expect(registry.resolve('s10')).toBeNull();
            expect(registry.resolve('s20')).toBeNull();
        });
    });
});
