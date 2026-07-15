// @vitest-environment jsdom
/**
 * Stage 2 invariant: region-scoped slicing must not change what renders.
 *
 * The server slices a haplotype to the segments in the viewport. Every on-screen
 * chain boundary is by definition inside the viewport, so the slice keeps all
 * boundary-hitting steps and only drops off-screen ones. This test proves the
 * resolver produces IDENTICAL chain overlays whether fed the full walk or a
 * slice that retains the boundary steps.
 */
import { describe, it, expect } from 'vitest';
import { resolvePathByBoundaries } from '@graph/engines/path-trace/path-trace-boundary-resolver.js';

function overlaysToPlain(chainOverlays) {
    const out = {};
    for (const [chainId, data] of chainOverlays) {
        out[chainId] = data.tRanges.map(r => [r.start, r.end]);
    }
    return out;
}

describe('region-scoped resolution invariance', () => {
    const container = { poppedRanges: [] };
    const entrySeg = { tRange: { start: 0, end: 5 } };
    const exitSeg = { tRange: { start: 5, end: 10 } };

    const boundaryIndex = new Map([
        ['s100', { chainId: 'c1', role: 'entry', container, segment: entrySeg }],
        ['s200', { chainId: 'c1', role: 'exit', container, segment: exitSeg }],
    ]);

    // In-region slice: the boundary steps (100, 200) plus interior 150.
    const sliced = [
        { segId: 100, direction: '+' },
        { segId: 150, direction: '+' },
        { segId: 200, direction: '+' },
    ];

    // Whole walk: the slice wrapped in off-screen steps the slice would drop.
    const whole = [
        { segId: 1, direction: '+' },
        { segId: 2, direction: '-' },
        ...sliced,
        { segId: 900, direction: '+' },
        { segId: 901, direction: '+' },
    ];

    it('produces identical chain overlays for whole walk vs region slice', () => {
        const rSlice = resolvePathByBoundaries(sliced, boundaryIndex);
        const rWhole = resolvePathByBoundaries(whole, boundaryIndex);
        expect(overlaysToPlain(rSlice.chainOverlays))
            .toEqual(overlaysToPlain(rWhole.chainOverlays));
    });

    it('emits the chain traversal for the in-region boundary pair', () => {
        const r = resolvePathByBoundaries(sliced, boundaryIndex);
        expect(overlaysToPlain(r.chainOverlays)).toEqual({ c1: [[0, 10]] });
    });

    it('off-region-only steps yield no overlays', () => {
        const r = resolvePathByBoundaries(
            [{ segId: 1, direction: '+' }, { segId: 900, direction: '+' }],
            boundaryIndex);
        expect(overlaysToPlain(r.chainOverlays)).toEqual({});
    });
});
