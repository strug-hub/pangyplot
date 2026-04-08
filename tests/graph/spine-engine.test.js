import { describe, it, expect, beforeEach } from 'vitest';
import { initSpine, isReady, bpToLayout, layoutToBp } from '@graph/engines/reference-spine-engine.js';

// Simple 5-point spine: horizontal line from x=0 to x=40,
// y varies slightly, bp goes 1000 → 5000
const SPINE = [
    [0,  0, 1000],
    [10, 2, 2000],
    [20, 1, 3000],
    [30, 3, 4000],
    [40, 0, 5000],
];

describe('initSpine / isReady', () => {
    it('isReady after init', () => {
        initSpine(SPINE);
        expect(isReady()).toBe(true);
    });
});

describe('bpToLayout', () => {
    beforeEach(() => initSpine(SPINE));

    it('returns exact point for spine bp', () => {
        const pt = bpToLayout(1000);
        expect(pt.x).toBeCloseTo(0, 1);
        expect(pt.y).toBeCloseTo(0, 1);
    });

    it('returns exact point for last spine bp', () => {
        const pt = bpToLayout(5000);
        expect(pt.x).toBeCloseTo(40, 1);
        expect(pt.y).toBeCloseTo(0, 1);
    });

    it('interpolates between spine points', () => {
        // Midpoint between [10,2,2000] and [20,1,3000] → bp=2500
        const pt = bpToLayout(2500);
        expect(pt.x).toBeCloseTo(15, 1);
        expect(pt.y).toBeCloseTo(1.5, 1);
    });

    it('clamps before first point', () => {
        const pt = bpToLayout(0);
        expect(pt.x).toBeCloseTo(0, 1);
        expect(pt.y).toBeCloseTo(0, 1);
    });

    it('clamps after last point', () => {
        const pt = bpToLayout(99999);
        expect(pt.x).toBeCloseTo(40, 1);
        expect(pt.y).toBeCloseTo(0, 1);
    });

    it('returns null when not initialized', () => {
        initSpine([]);
        expect(bpToLayout(1000)).toBeNull();
    });
});

describe('layoutToBp', () => {
    beforeEach(() => initSpine(SPINE));

    it('returns correct bp for point on spine', () => {
        // Point at (10, 2) is exactly spine point 2 → bp=2000
        const bp = layoutToBp(10, 2);
        expect(bp).toBeCloseTo(2000, -1);
    });

    it('returns correct bp for midpoint on segment', () => {
        // Midpoint of segment [0,0]→[10,2] is (5,1) → bp=1500
        const bp = layoutToBp(5, 1);
        expect(bp).toBeCloseTo(1500, -1);
    });

    it('round-trips with bpToLayout', () => {
        const testBps = [1500, 2500, 3500, 4500];
        for (const bp of testBps) {
            const pt = bpToLayout(bp);
            const recovered = layoutToBp(pt.x, pt.y);
            expect(recovered).toBeCloseTo(bp, -1);
        }
    });

    it('returns null when not initialized', () => {
        initSpine([]);
        expect(layoutToBp(10, 2)).toBeNull();
    });
});
