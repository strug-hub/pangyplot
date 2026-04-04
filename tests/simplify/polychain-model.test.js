import { describe, it, expect, beforeEach } from 'vitest';
import { PolychainSegment } from '@model/polychain-segment.js';
import { PolychainContainer } from '@model/polychain-container.js';
import * as registry from '@model/segment-registry.js';

beforeEach(() => {
    registry.clear();
    PolychainSegment.resetAnchorCounter();
});

// --- Helpers ---

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

// --- PolychainSegment ---

describe('PolychainSegment', () => {
    it('sets ends from head/tail segs', () => {
        const c = makeContainer();
        const seg = c.segments[0];
        expect(seg.ends.head).toEqual(['s10']);
        expect(seg.ends.tail).toEqual(['s20']);
    });

    it('has two anchor physics nodes', () => {
        const c = makeContainer();
        const seg = c.segments[0];
        expect(seg.physicsNodes).toHaveLength(2);
        expect(seg.headAnchor).toBe(seg.physicsNodes[0]);
        expect(seg.tailAnchor).toBe(seg.physicsNodes[1]);
    });

    it('anchors are pinned at initial spine positions', () => {
        const c = makeContainer();
        const seg = c.segments[0];
        // t=0 → x=0, t=1 → x=400
        expect(seg.headAnchor.fx).toBeCloseTo(0, 0);
        expect(seg.tailAnchor.fx).toBeCloseTo(400, 0);
    });

    it('anchors are invisible', () => {
        const c = makeContainer();
        const seg = c.segments[0];
        expect(seg.headAnchor.isAnchor).toBe(true);
        expect(seg.headAnchor.isVisible).toBe(false);
    });

    it('anchors have simObject back-reference', () => {
        const c = makeContainer();
        const seg = c.segments[0];
        expect(seg.headAnchor.simObject).toBe(seg);
        expect(seg.tailAnchor.simObject).toBe(seg);
    });

    it('has no physics links', () => {
        const c = makeContainer();
        expect(c.segments[0].physicsLinks).toHaveLength(0);
    });

    describe('resolveEnd', () => {
        it('returns headAnchor for head seg match', () => {
            const c = makeContainer();
            const seg = c.segments[0];
            const link = { source: 's10', target: 's50', fromStrand: '+', toStrand: '+' };
            expect(seg.resolveEnd(link)).toBe(seg.headAnchor);
        });

        it('returns tailAnchor for tail seg match', () => {
            const c = makeContainer();
            const seg = c.segments[0];
            const link = { source: 's50', target: 's20', fromStrand: '+', toStrand: '+' };
            expect(seg.resolveEnd(link)).toBe(seg.tailAnchor);
        });

        it('returns null for unrelated segments', () => {
            const c = makeContainer();
            const seg = c.segments[0];
            const link = { source: 's999', target: 's888', fromStrand: '+', toStrand: '+' };
            expect(seg.resolveEnd(link)).toBeNull();
        });
    });

    describe('updateAnchors (pulls from container)', () => {
        it('updates anchor positions from live spine', () => {
            const c = makeContainer();
            const seg = c.segments[0];
            // Move spine nodes
            c.spineNodes[0].x = 10;
            c.spineNodes[4].x = 500;
            seg.updateAnchors();
            expect(seg.headAnchor.fx).toBeCloseTo(10, 0);
            expect(seg.tailAnchor.fx).toBeCloseTo(500, 0);
        });
    });

    describe('getPolyline', () => {
        it('returns polyline from container spine', () => {
            const c = makeContainer();
            const seg = c.segments[0];
            const pl = seg.getPolyline();
            expect(pl.length).toBeGreaterThanOrEqual(2);
            expect(pl[0][0]).toBeCloseTo(0, 0);
            expect(pl[pl.length - 1][0]).toBeCloseTo(400, 0);
        });
    });

    describe('getBubbleCircles', () => {
        it('returns positioned bubble circles from container', () => {
            const c = makeContainer({
                bubbles: [
                    { id: 'b1', t: 0.25 },
                    { id: 'b2', t: 0.75 },
                ],
            });
            const seg = c.segments[0];
            const circles = seg.getBubbleCircles();
            expect(circles).toHaveLength(2);
            expect(circles[0].x).toBeCloseTo(100, 0);  // t=0.25 on [0,400]
            expect(circles[1].x).toBeCloseTo(300, 0);  // t=0.75
        });

        it('excludes popped bubbles', () => {
            const c = makeContainer({
                bubbles: [
                    { id: 'b1', t: 0.25 },
                    { id: 'b2', t: 0.75 },
                ],
            });
            c.poppedRanges.push({ tStart: 0.24, tEnd: 0.26, bubbleId: 'b1' });
            const circles = c.segments[0].getBubbleCircles();
            expect(circles).toHaveLength(1);
            expect(circles[0].id).toBe('b2');
        });
    });

    describe('getRenderables', () => {
        it('returns polyline + bubble circle specs', () => {
            const c = makeContainer({
                bubbles: [{ id: 'b1', t: 0.5 }],
            });
            const specs = c.segments[0].getRenderables();
            const polylines = specs.filter(s => s.type === 'polyline');
            const circles = specs.filter(s => s.type === 'circle');
            expect(polylines).toHaveLength(1);
            expect(circles).toHaveLength(1);
            expect(circles[0].layer).toBe('bubble-circle');
        });
    });
});

// --- PolychainContainer ---

describe('PolychainContainer', () => {
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

    describe('positionAt', () => {
        it('returns first node at t=0', () => {
            const pos = makeContainer().positionAt(0);
            expect(pos.x).toBe(0);
            expect(pos.y).toBe(0);
        });

        it('returns last node at t=1', () => {
            const pos = makeContainer().positionAt(1);
            expect(pos.x).toBe(400);
        });

        it('interpolates at t=0.5', () => {
            const pos = makeContainer().positionAt(0.5);
            expect(pos.x).toBeCloseTo(200, 0);
        });

        it('handles single-node spine', () => {
            const nodes = [{ id: 'pn_0', iid: 'pn_0', x: 50, y: 10, chainId: 'c1' }];
            const c = new PolychainContainer({
                id: 'c1', spineNodes: nodes, spineLinks: [],
                headSegs: ['s1'], tailSegs: ['s2'],
            });
            expect(c.positionAt(0.5).x).toBe(50);
        });
    });

    describe('polylineInRange', () => {
        it('returns full polyline for [0, 1]', () => {
            const pl = makeContainer().polylineInRange(0, 1);
            expect(pl.length).toBeGreaterThanOrEqual(2);
            expect(pl[0][0]).toBeCloseTo(0, 0);
            expect(pl[pl.length - 1][0]).toBeCloseTo(400, 0);
        });

        it('returns partial polyline', () => {
            const pl = makeContainer().polylineInRange(0.25, 0.75);
            expect(pl[0][0]).toBeCloseTo(100, 0);
            expect(pl[pl.length - 1][0]).toBeCloseTo(300, 0);
        });
    });

    describe('bubblesInRange', () => {
        it('returns bubbles within range', () => {
            const c = makeContainer({
                bubbles: [
                    { id: 'b1', t: 0.1 },
                    { id: 'b2', t: 0.5 },
                    { id: 'b3', t: 0.9 },
                ],
            });
            const result = c.bubblesInRange(0.2, 0.8);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('b2');
        });

        it('excludes popped bubbles', () => {
            const c = makeContainer({
                bubbles: [{ id: 'b1', t: 0.5 }],
            });
            c.poppedRanges.push({ tStart: 0.49, tEnd: 0.51, bubbleId: 'b1' });
            expect(c.bubblesInRange(0, 1)).toHaveLength(0);
        });
    });

    describe('splitAtBubble', () => {
        it('splits into two segments', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments).toHaveLength(2);
        });

        it('left covers [0, 0.45] and right covers [0.55, 1]', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments[0].tRange.end).toBeCloseTo(0.45);
            expect(c.segments[1].tRange.start).toBeCloseTo(0.55);
        });

        it('preserves outer ends, assigns inner ends', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments[0].ends.head).toEqual(['s10']);
            expect(c.segments[0].ends.tail).toEqual(['s30']);
            expect(c.segments[1].ends.head).toEqual(['s31']);
            expect(c.segments[1].ends.tail).toEqual(['s20']);
        });

        it('marks bubble as popped', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.poppedRanges.some(pr => pr.bubbleId === 'b7')).toBe(true);
        });

        it('registers new segment ends in registry', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(registry.resolve('s30')).toBe(c.segments[0]);
            expect(registry.resolve('s31')).toBe(c.segments[1]);
        });

        it('creates new anchor nodes for split segments', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments[0].physicsNodes).toHaveLength(2);
            expect(c.segments[1].physicsNodes).toHaveLength(2);
        });
    });

    describe('mergeAtBubble', () => {
        it('merges two segments back into one', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            const result = c.mergeAtBubble('b7');
            expect(c.segments).toHaveLength(1);
            expect(result.removedSegments).toHaveLength(2);
        });

        it('restores original tRange', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            c.mergeAtBubble('b7');
            expect(c.segments[0].tRange.start).toBeCloseTo(0);
            expect(c.segments[0].tRange.end).toBeCloseTo(1);
        });

        it('restores original ends', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            c.mergeAtBubble('b7');
            expect(c.segments[0].ends.head).toEqual(['s10']);
            expect(c.segments[0].ends.tail).toEqual(['s20']);
        });

        it('unmarks bubble as popped', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            c.mergeAtBubble('b7');
            expect(c.poppedRanges.some(pr => pr.bubbleId === 'b7')).toBe(false);
        });
    });

    describe('multiple splits', () => {
        it('handles two non-adjacent splits', () => {
            const c = makeContainer({
                bubbles: [{ id: 'b0', t: 0.1 }, { id: 'b7', t: 0.3 }, { id: 'b5', t: 0.5 }, { id: 'b8', t: 0.7 }, { id: 'b9', t: 0.9 }],
            });
            c.splitAtBubble('b7', 0.3, 0.05, ['s30'], ['s31']);
            c.splitAtBubble('b8', 0.7, 0.05, ['s40'], ['s41']);
            expect(c.segments).toHaveLength(3);
        });

        it('merges in reverse order', () => {
            const c = makeContainer({
                bubbles: [{ id: 'b0', t: 0.1 }, { id: 'b7', t: 0.3 }, { id: 'b5', t: 0.5 }, { id: 'b8', t: 0.7 }, { id: 'b9', t: 0.9 }],
            });
            c.splitAtBubble('b7', 0.3, 0.05, ['s30'], ['s31']);
            c.splitAtBubble('b8', 0.7, 0.05, ['s40'], ['s41']);
            c.mergeAtBubble('b8');
            expect(c.segments).toHaveLength(2);
            c.mergeAtBubble('b7');
            expect(c.segments).toHaveLength(1);
        });
    });

    describe('segment rendering pulls from container', () => {
        it('segment getPolyline returns polyline after split', () => {
            const c = makeContainer({
                bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }],
            });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            expect(c.segments).toHaveLength(2);
            const leftPl = c.segments[0].getPolyline();
            const rightPl = c.segments[1].getPolyline();
            expect(leftPl.length).toBeGreaterThanOrEqual(2);
            expect(rightPl.length).toBeGreaterThanOrEqual(2);
            // Left ends before midpoint, right starts after
            expect(leftPl[leftPl.length - 1][0]).toBeLessThan(250);
            expect(rightPl[0][0]).toBeGreaterThan(150);
        });

        it('segment getBubbleCircles returns only its range', () => {
            const c = makeContainer({
                bubbles: [
                    { id: 'b1', t: 0.2 },
                    { id: 'b7', t: 0.5 },
                    { id: 'b2', t: 0.8 },
                ],
            });
            c.splitAtBubble('b7', 0.5, 0.1, ['s30'], ['s31']);
            const leftCircles = c.segments[0].getBubbleCircles();
            const rightCircles = c.segments[1].getBubbleCircles();
            expect(leftCircles).toHaveLength(1);
            expect(leftCircles[0].id).toBe('b1');
            expect(rightCircles).toHaveLength(1);
            expect(rightCircles[0].id).toBe('b2');
        });
    });

    describe('getAllAnchorNodes', () => {
        it('returns 2 anchors for unsplit chain', () => {
            expect(makeContainer().getAllAnchorNodes()).toHaveLength(2);
        });

        it('returns 4 anchors after one split', () => {
            const c = makeContainer({ bubbles: [{ id: 'b1', t: 0.2 }, { id: 'b7', t: 0.5 }, { id: 'b2', t: 0.8 }] });
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
