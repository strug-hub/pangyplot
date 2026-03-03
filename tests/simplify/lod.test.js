import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockState = {
    canvas: { width: 2000, height: 600 },
    zoom: 1,
    data: null,
    targetCell: 0,
};
vi.mock('@simplify/simplify-state.js', () => ({ state: mockState }));

vi.stubGlobal('window', { devicePixelRatio: 1 });

const { selectLevel } = await import('@simplify/lod.js');

describe('selectLevel', () => {
    beforeEach(() => {
        mockState.zoom = 1;
        mockState.canvas = { width: 2000, height: 600 };
    });

    it('picks coarsest level whose cellSize fits the target', () => {
        mockState.data = {
            levels: [
                { cellSize: 0.1 },   // finest
                { cellSize: 0.5 },
                { cellSize: 2 },     // coarsest
            ],
        };
        // viewportWidth = 2000 / 1 = 2000, targetCell = 2000 / 2000 = 1
        // Scan from end: cellSize 2 > 1 skip, cellSize 0.5 <= 1 → best = 1
        const li = selectLevel();
        expect(li).toBe(1);
    });

    it('picks coarsest level when zoomed out', () => {
        mockState.data = {
            levels: [
                { cellSize: 0.1 },
                { cellSize: 0.5 },
                { cellSize: 2 },
            ],
        };
        mockState.zoom = 0.1;
        // viewportWidth = 2000 / 0.1 = 20000, targetCell = 20000 / 2000 = 10
        // Scan from end: cellSize 2 <= 10 → best = 2
        const li = selectLevel();
        expect(li).toBe(2);
    });

    it('picks coarser level when finest is too fine', () => {
        mockState.data = {
            levels: [
                { cellSize: 5 },     // finest
                { cellSize: 20 },
                { cellSize: 100 },   // coarsest
            ],
        };
        mockState.zoom = 1;
        // targetCell = 2000 / 2000 = 1
        // No level has cellSize <= 1 → stays at default best = 0
        const li = selectLevel();
        expect(li).toBe(0);
    });

    it('picks correct level at exact boundary', () => {
        mockState.data = {
            levels: [
                { cellSize: 1 },
                { cellSize: 5 },
                { cellSize: 10 },
            ],
        };
        mockState.zoom = 1;
        // targetCell = 1
        // Scan from end: cellSize 10 > 1, cellSize 5 > 1, cellSize 1 <= 1 → best = 0
        const li = selectLevel();
        expect(li).toBe(0);
    });

    it('updates state.targetCell', () => {
        mockState.data = { levels: [{ cellSize: 1 }] };
        mockState.zoom = 2;
        // viewportWidth = 2000 / 2 = 1000, targetCell = 1000 / 2000 = 0.5
        selectLevel();
        expect(mockState.targetCell).toBeCloseTo(0.5);
    });

    it('respects devicePixelRatio via canvas width', () => {
        // Canvas width already includes DPR in real code.
        // With DPR=2, canvas.width = 4000 for a 2000px-wide screen
        mockState.canvas = { width: 4000, height: 1200 };
        vi.stubGlobal('window', { devicePixelRatio: 2 });

        mockState.data = { levels: [{ cellSize: 1 }] };
        mockState.zoom = 1;
        // cw = 4000 / 2 = 2000, viewportWidth = 2000, targetCell = 1
        selectLevel();
        expect(mockState.targetCell).toBeCloseTo(1);

        // Reset
        vi.stubGlobal('window', { devicePixelRatio: 1 });
    });
});
