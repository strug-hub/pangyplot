import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock simplify-state before importing hit-test
const mockState = {
    zoom: 1,
    detailData: null,
    detailOpacity: 1,
    data: null,
    levelBboxes: [],
    canvas: { width: 1000, height: 600 },
    panX: 0,
    panY: 0,
};
vi.mock('@simplify/simplify-state.js', () => ({ state: mockState }));

// Mock lod to avoid its state dependency
vi.mock('@simplify/lod/lod.js', () => ({
    selectLevel: () => 0,
}));

// Mock viewport
vi.mock('@simplify/render/viewport.js', () => ({
    getViewport: () => ({ minX: -500, maxX: 500, minY: -300, maxY: 300 }),
}));

// Mock simplify-force
vi.mock('@simplify/data/simplify-force.js', () => ({
    getForceNodes: () => [],
}));

const {
    hitTestBubbles,
    hitTestChains,
    hitTestSkeleton,
    formatTooltip,
    formatBubbleTooltip,
    formatForceNodeTooltip,
    formatSkeletonTooltip,
} = await import('@simplify/utils/hit-test.js');

describe('hitTestBubbles', () => {
    beforeEach(() => {
        mockState.zoom = 1;
        mockState.detailOpacity = 1;
        mockState.detailData = null;
    });

    it('returns null when no detail data', () => {
        expect(hitTestBubbles(0, 0)).toBeNull();
    });

    it('returns null when opacity too low', () => {
        mockState.detailOpacity = 0.1;
        mockState.detailData = { bubbles: [{ x: 0, y: 0, rx: 10, ry: 10 }] };
        expect(hitTestBubbles(0, 0)).toBeNull();
    });

    it('hits a bubble at its center', () => {
        const bubble = { x: 50, y: 50, rx: 20, ry: 15 };
        mockState.detailData = { bubbles: [bubble] };
        expect(hitTestBubbles(50, 50)).toBe(bubble);
    });

    it('misses a bubble outside its ellipse', () => {
        const bubble = { x: 50, y: 50, rx: 10, ry: 10 };
        mockState.detailData = { bubbles: [bubble] };
        // Way outside — more than rx+margin away
        expect(hitTestBubbles(200, 200)).toBeNull();
    });

    it('hits within the hover margin', () => {
        // HIT_RADIUS_PX = 12, zoom = 1 → margin = 12
        const bubble = { x: 50, y: 50, rx: 10, ry: 10 };
        mockState.detailData = { bubbles: [bubble] };
        // Just outside rx (10) but within rx + margin (22)
        expect(hitTestBubbles(70, 50)).toBe(bubble);
    });

    it('returns first matching bubble', () => {
        const b1 = { x: 0, y: 0, rx: 20, ry: 20, id: 'first' };
        const b2 = { x: 0, y: 0, rx: 30, ry: 30, id: 'second' };
        mockState.detailData = { bubbles: [b1, b2] };
        expect(hitTestBubbles(0, 0)).toBe(b1);
    });
});

describe('hitTestChains', () => {
    beforeEach(() => {
        mockState.zoom = 1;
        mockState.detailOpacity = 1;
        mockState.detailData = null;
    });

    it('returns null when no detail data', () => {
        expect(hitTestChains(0, 0)).toBeNull();
    });

    it('hits a horizontal chain', () => {
        const chain = { polyline: [[0, 0], [100, 0]] };
        mockState.detailData = { chains: [chain] };
        // Point at y=5, within HIT_RADIUS_PX/zoom = 12
        expect(hitTestChains(50, 5)).toBe(chain);
    });

    it('misses a chain far away', () => {
        const chain = { polyline: [[0, 0], [100, 0]] };
        mockState.detailData = { chains: [chain] };
        expect(hitTestChains(50, 100)).toBeNull();
    });

    it('picks the closest chain', () => {
        const c1 = { polyline: [[0, 0], [100, 0]], id: 'top' };
        const c2 = { polyline: [[0, 20], [100, 20]], id: 'bottom' };
        mockState.detailData = { chains: [c1, c2] };
        // Closer to c1
        expect(hitTestChains(50, 3)).toBe(c1);
        // Closer to c2
        expect(hitTestChains(50, 18)).toBe(c2);
    });
});

describe('hitTestSkeleton', () => {
    beforeEach(() => {
        mockState.zoom = 1;
        mockState.data = null;
        mockState.levelBboxes = [];
    });

    it('returns null when no data', () => {
        expect(hitTestSkeleton(0, 0)).toBeNull();
    });

    it('hits a skeleton polyline', () => {
        mockState.data = {
            levels: [{
                polylines: [[[0, 0], [100, 0]]],
                chainIds: [42],
                cellSize: 50,
            }],
        };
        // Precompute bboxes for level 0
        mockState.levelBboxes = [new Float64Array([0, 0, 100, 0])];

        const result = hitTestSkeleton(50, 3);
        expect(result).not.toBeNull();
        expect(result.chainId).toBe(42);
        expect(result.levelIdx).toBe(0);
        expect(result.plIdx).toBe(0);
    });

    it('skips polylines with chainId -1', () => {
        mockState.data = {
            levels: [{
                polylines: [[[0, 0], [100, 0]]],
                chainIds: [-1],
                cellSize: 50,
            }],
        };
        mockState.levelBboxes = [new Float64Array([0, 0, 100, 0])];
        expect(hitTestSkeleton(50, 0)).toBeNull();
    });
});

describe('tooltip formatters', () => {
    it('formatTooltip includes chain id and subtype', () => {
        const chain = { id: 99, subtype: 'simple', length: 5000, nBubbles: 3, polyline: [[0,0],[1,1]], depth: 2 };
        const html = formatTooltip(chain);
        expect(html).toContain('99');
        expect(html).toContain('simple');
        expect(html).toContain('5.0kb');
        expect(html).toContain('3');
    });

    it('formatTooltip shows bp for short chains', () => {
        const chain = { id: 1, subtype: 'simple', length: 500, nBubbles: 1, polyline: [[0,0]], depth: 0 };
        const html = formatTooltip(chain);
        expect(html).toContain('500bp');
    });

    it('formatBubbleTooltip includes bubble info', () => {
        const bubble = { id: 'b42', subtype: 'superbubble', length: 12000, chain: 'c5' };
        const html = formatBubbleTooltip(bubble);
        expect(html).toContain('b42');
        expect(html).toContain('superbubble');
        expect(html).toContain('12.0kb');
        expect(html).toContain('c5');
    });

    it('formatForceNodeTooltip includes node info', () => {
        const node = { type: 'segment', id: 's1', seqLength: 3500, chainId: 'c10', recordId: 'r1' };
        const html = formatForceNodeTooltip(node);
        expect(html).toContain('segment');
        expect(html).toContain('r1');
        expect(html).toContain('3.5kb');
        expect(html).toContain('c10');
    });

    it('formatForceNodeTooltip shows bp for short seqs', () => {
        const node = { type: 'bubble', id: 'b1', seqLength: 200, chainId: 'c1' };
        const html = formatForceNodeTooltip(node);
        expect(html).toContain('200bp');
    });

    it('formatSkeletonTooltip builds ancestry string', () => {
        mockState.data = {
            chainMeta: {
                '5': { parent: 2, n_bubbles: 10, total_length: 50000 },
                '2': { parent: 1, n_bubbles: 20, total_length: 100000 },
                '1': { parent: null, n_bubbles: 50, total_length: 500000 },
            },
        };
        const html = formatSkeletonTooltip({ chainId: 5 });
        expect(html).toContain('c1 > c2 > c5');
        expect(html).toContain('50.0kb');
        expect(html).toContain('10');
    });

    it('formatSkeletonTooltip handles no metadata', () => {
        mockState.data = { chainMeta: null };
        const html = formatSkeletonTooltip({ chainId: 7 });
        expect(html).toContain('c7');
    });
});
