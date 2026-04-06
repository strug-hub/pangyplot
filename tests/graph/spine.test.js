import { describe, it, expect, beforeEach } from 'vitest';
import { initSpine, xToBp, bpToX, xToY, bpToStep, isReady, setChromosome, getChromosome } from '@graph/data/spine.js';

// A simple 5-point reference spine: [layoutX, basepair, layoutY, step]
// Linear: x 0..400, bp 0..4_000_000, y curves up then down, step 0..4000
const SPINE = [
    [0,   0,         100, 0],
    [100, 1_000_000, 150, 1000],
    [200, 2_000_000, 200, 2000],
    [300, 3_000_000, 150, 3000],
    [400, 4_000_000, 100, 4000],
];

describe('spine', () => {
    beforeEach(() => {
        initSpine(SPINE);
    });

    describe('isReady / chromosome', () => {
        it('reports ready after init', () => {
            expect(isReady()).toBe(true);
        });

        it('stores chromosome name', () => {
            setChromosome('chrY');
            expect(getChromosome()).toBe('chrY');
        });
    });

    describe('xToBp', () => {
        it('maps endpoints exactly', () => {
            expect(xToBp(0)).toBe(0);
            expect(xToBp(400)).toBe(4_000_000);
        });

        it('interpolates midpoint', () => {
            expect(xToBp(200)).toBe(2_000_000);
        });

        it('interpolates between spine points', () => {
            // x=50 is halfway between spine[0] (x=0) and spine[1] (x=100)
            expect(xToBp(50)).toBe(500_000);
        });

        it('clamps below range', () => {
            expect(xToBp(-100)).toBe(0);
        });

        it('clamps above range', () => {
            expect(xToBp(999)).toBe(4_000_000);
        });
    });

    describe('bpToX', () => {
        it('maps endpoints exactly', () => {
            expect(bpToX(0)).toBe(0);
            expect(bpToX(4_000_000)).toBe(400);
        });

        it('interpolates midpoint', () => {
            expect(bpToX(2_000_000)).toBe(200);
        });

        it('is inverse of xToBp', () => {
            for (const x of [0, 75, 150, 250, 400]) {
                const bp = xToBp(x);
                expect(bpToX(bp)).toBeCloseTo(x, 6);
            }
        });

        it('clamps below range', () => {
            expect(bpToX(-500)).toBe(0);
        });

        it('clamps above range', () => {
            expect(bpToX(99_000_000)).toBe(400);
        });
    });

    describe('xToY', () => {
        it('returns spine Y at exact points', () => {
            expect(xToY(0)).toBe(100);
            expect(xToY(200)).toBe(200);
            expect(xToY(400)).toBe(100);
        });

        it('interpolates Y between spine points', () => {
            // Between (0, 100) and (100, 150) at x=50 → y=125
            expect(xToY(50)).toBe(125);
        });

        it('clamps beyond range', () => {
            expect(xToY(-50)).toBe(100);
            expect(xToY(500)).toBe(100);
        });
    });

    describe('bpToStep', () => {
        it('maps endpoints', () => {
            expect(bpToStep(0)).toBe(0);
            expect(bpToStep(4_000_000)).toBe(4000);
        });

        it('interpolates', () => {
            expect(bpToStep(2_000_000)).toBe(2000);
            expect(bpToStep(500_000)).toBe(500);
        });

        it('clamps below range', () => {
            expect(bpToStep(-100)).toBe(0);
        });

        it('clamps above range', () => {
            expect(bpToStep(10_000_000)).toBe(4000);
        });
    });

    describe('edge cases', () => {
        it('handles single-point spine', () => {
            initSpine([[50, 1_000_000, 200, 500]]);
            expect(xToBp(50)).toBe(1_000_000);
            expect(xToBp(0)).toBe(1_000_000);   // clamp
            expect(xToBp(100)).toBe(1_000_000);  // clamp
        });

        it('handles two-point spine', () => {
            initSpine([
                [0, 0, 0, 0],
                [100, 1_000_000, 100, 1000],
            ]);
            expect(xToBp(50)).toBe(500_000);
            expect(bpToX(500_000)).toBeCloseTo(50, 6);
        });
    });
});
