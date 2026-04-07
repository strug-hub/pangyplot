import { describe, it, expect, beforeEach } from 'vitest';
import eventBus from '@event-bus';

// --- helpers ---

function collectEvents(eventName) {
    const events = [];
    eventBus.subscribe(eventName, (data) => events.push(data));
    return events;
}

beforeEach(() => {
    for (const key of Object.keys(eventBus.events)) {
        delete eventBus.events[key];
    }
});

// =============================================================================
// Coordinate text input parsing
// Mirrors updateGenomicCoordinates logic from coordinates.js:112-148
// =============================================================================

function parseCoordinateInput(rawText) {
    if (rawText == null || rawText === "") {
        return null;
    }
    let input = rawText.replace(/\s+/g, "").replace(/,/g, "");

    const coordPattern = /^([^:]+):(\d+)-(\d+)$/;
    const coordMatch = input.match(coordPattern);

    if (coordMatch) {
        let [, chromosome, startStr, endStr] = coordMatch;
        let start = parseInt(startStr, 10);
        let end = parseInt(endStr, 10);

        if (end < 0 || start < 0 || end < start) {
            return { error: true };
        }

        return { chromosome, start, end, source: "coordinate-text" };
    }

    if (/^[A-Za-z0-9._|:+-]+$/.test(input) && !input.includes(':')) {
        return { chromosome: input, start: null, end: null, source: "coordinate-text" };
    }

    return { error: true };
}

describe('coordinate text input parsing', () => {
    it('parses "chr1:1000-5000" into chromosome, start, end', () => {
        const result = parseCoordinateInput('chr1:1000-5000');
        expect(result).toEqual({
            chromosome: 'chr1',
            start: 1000,
            end: 5000,
            source: 'coordinate-text',
        });
    });

    it('strips whitespace and commas before parsing', () => {
        const result = parseCoordinateInput('chr1 : 1,000 - 5,000');
        expect(result).toEqual({
            chromosome: 'chr1',
            start: 1000,
            end: 5000,
            source: 'coordinate-text',
        });
    });

    it('accepts bare chromosome name without coordinates', () => {
        const result = parseCoordinateInput('chrY');
        expect(result).toEqual({
            chromosome: 'chrY',
            start: null,
            end: null,
            source: 'coordinate-text',
        });
    });

    it('accepts chromosome names with dots and underscores', () => {
        const result = parseCoordinateInput('chrUn_1.2');
        expect(result).toEqual({
            chromosome: 'chrUn_1.2',
            start: null,
            end: null,
            source: 'coordinate-text',
        });
    });

    it('rejects when end < start', () => {
        const result = parseCoordinateInput('chr1:5000-1000');
        expect(result).toEqual({ error: true });
    });

    it('rejects empty string', () => {
        expect(parseCoordinateInput('')).toBeNull();
    });

    it('rejects null', () => {
        expect(parseCoordinateInput(null)).toBeNull();
    });

    it('accepts start equal to end', () => {
        const result = parseCoordinateInput('chr1:1000-1000');
        expect(result).toEqual({
            chromosome: 'chr1',
            start: 1000,
            end: 1000,
            source: 'coordinate-text',
        });
    });
});

// =============================================================================
// Coordinate text -> event bus integration
// =============================================================================

describe('coordinate text publishes events', () => {
    it('emits ui:coordinates-changed with parsed coordinates', () => {
        const received = collectEvents('ui:coordinates-changed');

        const parsed = parseCoordinateInput('chr7:100-500');
        if (parsed && !parsed.error) {
            eventBus.publish('ui:coordinates-changed', parsed);
        }

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            chromosome: 'chr7',
            start: 100,
            end: 500,
            source: 'coordinate-text',
        });
    });

    it('emits chromosome-only event for bare name', () => {
        const received = collectEvents('ui:coordinates-changed');

        const parsed = parseCoordinateInput('chr3');
        if (parsed && !parsed.error) {
            eventBus.publish('ui:coordinates-changed', parsed);
        }

        expect(received).toHaveLength(1);
        expect(received[0].chromosome).toBe('chr3');
        expect(received[0].start).toBeNull();
        expect(received[0].end).toBeNull();
    });

    it('does not emit for invalid input', () => {
        const received = collectEvents('ui:coordinates-changed');

        const parsed = parseCoordinateInput('!!!');
        if (parsed && !parsed.error) {
            eventBus.publish('ui:coordinates-changed', parsed);
        }

        expect(received).toHaveLength(0);
    });
});

// =============================================================================
// Flanking region calculation
// Mirrors getFlankingInput logic from coordinates.js:150-173
// =============================================================================

function parseFlankingInput(rawText) {
    if (rawText == null || rawText === "") return 0;
    let input = rawText.replace(/\s+/g, "").toLowerCase();

    const pattern = /^(\d+)(kb|mb)?$/;
    if (!pattern.test(input)) return 0;

    const match = input.match(pattern);
    const numberPart = parseInt(match[1]);
    let suffix = match[2] ? match[2] : "1";
    if (suffix === "mb") suffix = "1000000";
    if (suffix === "kb") suffix = "1000";
    suffix = parseInt(suffix);

    return numberPart * suffix;
}

describe('flanking region parsing', () => {
    it('parses bare number as base pairs', () => {
        expect(parseFlankingInput('500')).toBe(500);
    });

    it('parses "10kb" as 10000', () => {
        expect(parseFlankingInput('10kb')).toBe(10000);
    });

    it('parses "2mb" as 2000000', () => {
        expect(parseFlankingInput('2mb')).toBe(2000000);
    });

    it('handles whitespace', () => {
        expect(parseFlankingInput(' 5 kb ')).toBe(5000);
    });

    it('is case insensitive', () => {
        expect(parseFlankingInput('3KB')).toBe(3000);
        expect(parseFlankingInput('1MB')).toBe(1000000);
    });

    it('returns 0 for empty string', () => {
        expect(parseFlankingInput('')).toBe(0);
    });

    it('returns 0 for null', () => {
        expect(parseFlankingInput(null)).toBe(0);
    });

    it('returns 0 for invalid input', () => {
        expect(parseFlankingInput('abc')).toBe(0);
        expect(parseFlankingInput('10gb')).toBe(0);
    });
});

// =============================================================================
// Go button: ui:construct-graph event shape
// Mirrors the click handler in coordinates.js:26-64
// =============================================================================

describe('go button publishes ui:construct-graph', () => {
    it('emits with chromosome and coordinates', () => {
        const received = collectEvents('ui:construct-graph');

        const data = {
            genome: 'GRCh38',
            chromosome: 'chr7',
            start: '1000',
            end: '5000',
        };
        eventBus.publish('ui:construct-graph', data);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            genome: 'GRCh38',
            chromosome: 'chr7',
            start: '1000',
            end: '5000',
        });
    });

    it('emits with null coordinates when no start/end', () => {
        const received = collectEvents('ui:construct-graph');

        const data = {
            genome: 'GRCh38',
            chromosome: 'chr7',
            start: null,
            end: null,
        };
        eventBus.publish('ui:construct-graph', data);

        expect(received).toHaveLength(1);
        expect(received[0].start).toBeNull();
        expect(received[0].end).toBeNull();
    });

    it('applies minus flanking to start coordinate', () => {
        const start = 10000;
        const flanking = parseFlankingInput('5kb');
        const adjusted = Math.max(0, start - flanking);

        expect(adjusted).toBe(5000);
    });

    it('clamps minus flanking to zero', () => {
        const start = 2000;
        const flanking = parseFlankingInput('5kb');
        const adjusted = Math.max(0, start - flanking);

        expect(adjusted).toBe(0);
    });

    it('applies plus flanking to end coordinate', () => {
        const end = 50000;
        const flanking = parseFlankingInput('10kb');
        const adjusted = end + flanking;

        expect(adjusted).toBe(60000);
    });
});

// =============================================================================
// URL hash generation
// Mirrors updateUrlHash from coordinates.js:9-13
// =============================================================================

function formatUrlHash(chromosome, start, end) {
    if (chromosome && start != null && end != null) {
        return `#${chromosome}:${start}-${end}`;
    }
    return null;
}

describe('URL hash formatting', () => {
    it('formats chromosome:start-end', () => {
        expect(formatUrlHash('chr1', 1000, 5000)).toBe('#chr1:1000-5000');
    });

    it('returns null when chromosome missing', () => {
        expect(formatUrlHash(null, 1000, 5000)).toBeNull();
    });

    it('returns null when start is null', () => {
        expect(formatUrlHash('chr1', null, 5000)).toBeNull();
    });

    it('returns null when end is null', () => {
        expect(formatUrlHash('chr1', 1000, null)).toBeNull();
    });
});
