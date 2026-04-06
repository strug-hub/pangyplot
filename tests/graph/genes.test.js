import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock simplify-state (gene-label-renderer imports it for drawGeneLabels)
vi.mock('@graph/state.js', () => ({
    state: { zoom: 1, panX: 0, panY: 0, detailOpacity: 1 },
}));

import { initSpine } from '@graph/data/spine.js';
import { placeGenes, getGenePins } from '@graph/render/annotation/gene-label-renderer.js';

// Spine covering chrY range (0..30 Mbp) with a curve
// x = bp / 100_000 (so 30 Mbp → x=300), y arcs up and back
const SPINE = [];
for (let i = 0; i <= 300; i += 10) {
    const bp = i * 100_000;
    const y = 100 + 50 * Math.sin(Math.PI * i / 300);
    SPINE.push([i, bp, y, Math.round(bp / 1000)]);
}

describe('genes', () => {
    beforeEach(() => {
        initSpine(SPINE);
    });

    it('places known chrY genes', () => {
        placeGenes();
        const pins = getGenePins();
        expect(pins.length).toBeGreaterThan(0);

        // SRY should be the first gene (lowest bp)
        const sry = pins.find(p => p.name === 'SRY');
        expect(sry).toBeDefined();
        expect(sry.startX).toBeLessThan(sry.endX);
    });

    it('every pin has required fields', () => {
        placeGenes();
        for (const pin of getGenePins()) {
            expect(pin).toHaveProperty('name');
            expect(pin).toHaveProperty('startX');
            expect(pin).toHaveProperty('endX');
            expect(pin).toHaveProperty('midX');
            expect(pin).toHaveProperty('refY');
            expect(pin).toHaveProperty('minY');
            expect(pin).toHaveProperty('maxY');
            expect(typeof pin.startX).toBe('number');
            expect(Number.isFinite(pin.refY)).toBe(true);
        }
    });

    it('midX is between startX and endX', () => {
        placeGenes();
        for (const pin of getGenePins()) {
            expect(pin.midX).toBeGreaterThanOrEqual(pin.startX);
            expect(pin.midX).toBeLessThanOrEqual(pin.endX);
        }
    });

    it('minY <= refY <= maxY', () => {
        placeGenes();
        for (const pin of getGenePins()) {
            expect(pin.minY).toBeLessThanOrEqual(pin.refY);
            expect(pin.maxY).toBeGreaterThanOrEqual(pin.refY);
        }
    });

    it('genes are ordered by position', () => {
        placeGenes();
        const pins = getGenePins();
        for (let i = 1; i < pins.length; i++) {
            expect(pins[i].startX).toBeGreaterThan(pins[i - 1].startX);
        }
    });

    it('returns empty array before init', () => {
        // getGenePins returns whatever was last computed; before placeGenes it's []
        // Re-init spine to clear, then check
        initSpine([]);
        placeGenes();
        expect(getGenePins()).toEqual([]);
    });
});
