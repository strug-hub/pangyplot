import { describe, it, expect } from 'vitest';
import { formatBp, formatNodeLabel, formatPercentage } from '@utils/format-utils.js';

describe('formatBp', () => {
    it('formats small numbers with locale separators', () => {
        expect(formatBp(42)).toBe('42');
    });

    it('formats thousands with locale separators', () => {
        const result = formatBp(1234);
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

    it('returns ? for zero', () => {
        expect(formatBp(0)).toBe('?');
    });

    it('returns ? for null', () => {
        expect(formatBp(null)).toBe('?');
    });

    it('formats with unit Mb', () => {
        expect(formatBp(5_000_000, { unit: true })).toBe('5.0 Mb');
    });

    it('formats with unit kb', () => {
        expect(formatBp(2500, { unit: true })).toBe('2.5 kb');
    });

    it('formats with unit bp', () => {
        expect(formatBp(42, { unit: true })).toBe('42 bp');
    });
});

describe('formatNodeLabel', () => {
    it('formats bubble id', () => {
        const result = formatNodeLabel({ id: 'b123' });
        expect(result).toContain('123');
    });

    it('formats segment id', () => {
        const result = formatNodeLabel({ id: 's456' });
        expect(result).toContain('456');
    });

    it('handles empty id', () => {
        expect(formatNodeLabel({ id: '' })).toBe('');
    });
});

describe('formatPercentage', () => {
    it('formats percentage', () => {
        expect(formatPercentage(1, 4)).toBe('25.0%');
    });

    it('returns null for zero total', () => {
        expect(formatPercentage(1, 0)).toBeNull();
    });

    it('returns null for null inputs', () => {
        expect(formatPercentage(null, 10)).toBeNull();
    });
});
