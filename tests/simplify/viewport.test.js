import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock state
const mockState = {
    canvas: { width: 1000, height: 600 },
    panX: 0,
    panY: 0,
    zoom: 1,
    data: null,
    dataBounds: {},
    levelBboxes: [],
};
vi.mock('@simplify/simplify-state.js', () => ({ state: mockState }));

// Mock spine — bpToStep/xToBp are used by viewportStepCount
vi.mock('@simplify/spine.js', () => ({
    xToBp: (x) => x * 10_000,  // simple linear mapping
    bpToStep: (bp) => bp / 1000,
}));

// Stub devicePixelRatio
vi.stubGlobal('window', { devicePixelRatio: 1 });

const { precomputeBboxes, computeBounds, getViewport, viewportStepCount, fitToScreen } =
    await import('@simplify/viewport.js');

describe('precomputeBboxes', () => {
    it('computes bounding boxes for polylines', () => {
        mockState.data = {
            levels: [{
                polylines: [
                    [[0, 0], [10, 20], [5, 15]],
                    [[100, 200], [300, 400]],
                ],
            }],
        };
        precomputeBboxes();
        expect(mockState.levelBboxes.length).toBe(1);

        const bboxes = mockState.levelBboxes[0];
        // Polyline 0: minX=0, minY=0, maxX=10, maxY=20
        expect(bboxes[0]).toBe(0);
        expect(bboxes[1]).toBe(0);
        expect(bboxes[2]).toBe(10);
        expect(bboxes[3]).toBe(20);

        // Polyline 1: minX=100, minY=200, maxX=300, maxY=400
        expect(bboxes[4]).toBe(100);
        expect(bboxes[5]).toBe(200);
        expect(bboxes[6]).toBe(300);
        expect(bboxes[7]).toBe(400);
    });

    it('handles single-point polylines', () => {
        mockState.data = {
            levels: [{ polylines: [[[42, 99]]] }],
        };
        precomputeBboxes();
        const bboxes = mockState.levelBboxes[0];
        expect(bboxes[0]).toBe(42);
        expect(bboxes[1]).toBe(99);
        expect(bboxes[2]).toBe(42);
        expect(bboxes[3]).toBe(99);
    });

    it('handles multiple levels', () => {
        mockState.data = {
            levels: [
                { polylines: [[[0, 0], [10, 10]]] },
                { polylines: [[[0, 0], [5, 5]]] },
            ],
        };
        precomputeBboxes();
        expect(mockState.levelBboxes.length).toBe(2);
    });
});

describe('computeBounds', () => {
    it('computes data bounds from first level', () => {
        mockState.data = {
            levels: [{
                polylines: [
                    [[10, 20], [30, 40]],
                    [[-5, 50], [25, -10]],
                ],
            }],
        };
        computeBounds();
        expect(mockState.dataBounds).toEqual({
            minX: -5, maxX: 30, minY: -10, maxY: 50,
        });
    });
});

describe('getViewport', () => {
    it('returns viewport bounds from pan/zoom', () => {
        mockState.canvas = { width: 1000, height: 600 };
        mockState.panX = 0;
        mockState.panY = 0;
        mockState.zoom = 1;

        const vp = getViewport();
        // -0/zoom = -0 in IEEE 754; toBeCloseTo handles this
        expect(vp.minX).toBeCloseTo(0);
        expect(vp.minY).toBeCloseTo(0);
        expect(vp.maxX).toBe(1000);
        expect(vp.maxY).toBe(600);
    });

    it('accounts for pan offset', () => {
        mockState.canvas = { width: 1000, height: 600 };
        mockState.panX = 200;
        mockState.panY = 100;
        mockState.zoom = 1;

        const vp = getViewport();
        expect(vp.minX).toBe(-200);
        expect(vp.minY).toBe(-100);
        expect(vp.maxX).toBe(800);
        expect(vp.maxY).toBe(500);
    });

    it('accounts for zoom', () => {
        mockState.canvas = { width: 1000, height: 600 };
        mockState.panX = 0;
        mockState.panY = 0;
        mockState.zoom = 2;

        const vp = getViewport();
        expect(vp.minX).toBeCloseTo(0);
        expect(vp.minY).toBeCloseTo(0);
        expect(vp.maxX).toBe(500);
        expect(vp.maxY).toBe(300);
    });

    it('pan + zoom together', () => {
        mockState.canvas = { width: 1000, height: 600 };
        mockState.panX = 100;
        mockState.panY = 50;
        mockState.zoom = 2;

        const vp = getViewport();
        expect(vp.minX).toBe(-50);    // -100/2
        expect(vp.minY).toBe(-25);    // -50/2
        expect(vp.maxX).toBe(450);    // (1000 - 100) / 2
        expect(vp.maxY).toBe(275);    // (600 - 50) / 2
    });
});

describe('viewportStepCount', () => {
    it('returns step difference across viewport', () => {
        mockState.canvas = { width: 1000, height: 600 };
        mockState.panX = 0;
        mockState.panY = 0;
        mockState.zoom = 1;

        // With mock: xToBp(x) = x * 10_000, bpToStep(bp) = bp / 1000
        // viewport: minX=0, maxX=1000
        // bpLeft = 0, bpRight = 10_000_000
        // stepLeft = 0, stepRight = 10_000
        const steps = viewportStepCount();
        expect(steps).toBe(10_000);
    });
});

describe('fitToScreen', () => {
    it('sets zoom and pan to center data in canvas', () => {
        mockState.canvas = { width: 1000, height: 600 };
        mockState.dataBounds = { minX: 0, maxX: 100, minY: 0, maxY: 50 };

        fitToScreen();

        // pad = 40, cw = 1000, ch = 600
        // zoomX = (1000 - 80) / 100 = 9.2
        // zoomY = (600 - 80) / 50 = 10.4
        // zoom = min(9.2, 10.4) = 9.2
        expect(mockState.zoom).toBeCloseTo(9.2, 1);

        // panX = cw/2 - (minX + dw/2) * zoom = 500 - 50 * 9.2 = 500 - 460 = 40
        expect(mockState.panX).toBeCloseTo(40, 0);
    });

    it('does nothing for zero-size bounds', () => {
        mockState.canvas = { width: 1000, height: 600 };
        mockState.dataBounds = { minX: 50, maxX: 50, minY: 50, maxY: 50 };
        const oldZoom = mockState.zoom;
        fitToScreen();
        expect(mockState.zoom).toBe(oldZoom);
    });
});
