import { describe, it, expect } from 'vitest';
import { formatBp, subtypeColor } from '@simplify/format-utils.js';

describe('formatBp', () => {
    it('formats small numbers without separators', () => {
        expect(formatBp(42)).toBe('42');
    });

    it('formats thousands with locale separators', () => {
        const result = formatBp(1234);
        // Accept comma or period separator depending on locale
        expect(result).toMatch(/1.234/);
    });

    it('formats millions', () => {
        const result = formatBp(12345678);
        expect(result).toMatch(/12.345.678/);
    });

    it('rounds fractional basepairs', () => {
        expect(formatBp(99.7)).toBe('100');
        expect(formatBp(99.2)).toBe('99');
    });

    it('handles zero', () => {
        expect(formatBp(0)).toBe('0');
    });
});

describe('subtypeColor', () => {
    it('returns blue for simple', () => {
        expect(subtypeColor('simple')).toBe('#4a90d9');
    });

    it('returns pink for superbubble', () => {
        expect(subtypeColor('superbubble')).toBe('#d94a90');
    });

    it('returns green for unknown/other subtypes', () => {
        expect(subtypeColor('complex')).toBe('#90d94a');
        expect(subtypeColor('whatever')).toBe('#90d94a');
    });
});
