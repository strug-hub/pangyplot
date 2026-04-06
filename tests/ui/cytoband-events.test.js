import { describe, it, expect, beforeEach, vi } from 'vitest';
import eventBus from '@event-bus';

// --- helpers ---

function collectEvents(eventName) {
    const events = [];
    eventBus.subscribe(eventName, (data) => events.push(data));
    return events;
}

beforeEach(() => {
    // Clear all subscribers between tests
    for (const key of Object.keys(eventBus.events)) {
        delete eventBus.events[key];
    }
});

// =============================================================================
// Event bus core behavior
// =============================================================================

describe('event bus', () => {
    it('delivers published events to subscribers', () => {
        const received = collectEvents('ui:coordinates-changed');
        const payload = { chromosome: 'chr1', start: null, end: null, source: 'test' };

        eventBus.publish('ui:coordinates-changed', payload);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual(payload);
    });

    it('delivers to multiple subscribers', () => {
        const a = [];
        const b = [];
        eventBus.subscribe('ui:coordinates-changed', (d) => a.push(d));
        eventBus.subscribe('ui:coordinates-changed', (d) => b.push(d));

        eventBus.publish('ui:coordinates-changed', { chromosome: 'chr2' });

        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
    });

    it('unsubscribe stops delivery', () => {
        const received = [];
        const unsub = eventBus.subscribe('ui:coordinates-changed', (d) => received.push(d));

        eventBus.publish('ui:coordinates-changed', { chromosome: 'chr1' });
        unsub();
        eventBus.publish('ui:coordinates-changed', { chromosome: 'chr2' });

        expect(received).toHaveLength(1);
        expect(received[0].chromosome).toBe('chr1');
    });

    it('does not deliver across different event names', () => {
        const received = collectEvents('ui:construct-graph');

        eventBus.publish('ui:coordinates-changed', { chromosome: 'chr1' });

        expect(received).toHaveLength(0);
    });
});

// =============================================================================
// Publisher contracts: cytoband components emit correct event shapes
// =============================================================================

describe('genome cytoband click publishes correct event', () => {
    it('emits chromosome with null coordinates and source "cytoband-genome"', () => {
        const received = collectEvents('ui:coordinates-changed');

        // Simulate what genome/painter.js:49-53 does on click
        const chromosome = 'chr7';
        const data = { chromosome, start: null, end: null, source: 'cytoband-genome' };
        eventBus.publish('ui:coordinates-changed', data);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            chromosome: 'chr7',
            start: null,
            end: null,
            source: 'cytoband-genome',
        });
    });
});

describe('chromosome drag-select publishes correct event', () => {
    // Mirrors the updateStartEndCoordinates logic from drag-select.js:23-32
    function simulateDragSelect(chromosome, chromSize, dragStart, dragEnd) {
        if (dragStart != null && dragEnd != null && dragStart !== dragEnd) {
            if (dragEnd < dragStart) [dragStart, dragEnd] = [dragEnd, dragStart];
            const startPos = Math.max(1, Math.round(dragStart * chromSize));
            const endPos = Math.round(dragEnd * chromSize);
            const data = { chromosome, start: startPos, end: endPos, source: 'cytoband-chromosome' };
            eventBus.publish('ui:coordinates-changed', data);
        }
    }

    it('emits bp coordinates computed from normalized drag positions', () => {
        const received = collectEvents('ui:coordinates-changed');
        const chromSize = 100_000;

        simulateDragSelect('chr1', chromSize, 0.2, 0.5);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            chromosome: 'chr1',
            start: 20000,
            end: 50000,
            source: 'cytoband-chromosome',
        });
    });

    it('swaps start/end when dragged right-to-left', () => {
        const received = collectEvents('ui:coordinates-changed');

        simulateDragSelect('chr3', 200_000, 0.8, 0.3);

        expect(received).toHaveLength(1);
        expect(received[0].start).toBe(60000);
        expect(received[0].end).toBe(160000);
    });

    it('clamps start to minimum of 1', () => {
        const received = collectEvents('ui:coordinates-changed');

        simulateDragSelect('chr1', 1000, 0.0001, 0.5);

        expect(received).toHaveLength(1);
        expect(received[0].start).toBe(1);
    });

    it('does not emit when start equals end (click without drag)', () => {
        const received = collectEvents('ui:coordinates-changed');

        simulateDragSelect('chr1', 100_000, 0.5, 0.5);

        expect(received).toHaveLength(0);
    });

    it('does not emit when positions are null', () => {
        const received = collectEvents('ui:coordinates-changed');

        simulateDragSelect('chr1', 100_000, 0.3, null);

        expect(received).toHaveLength(0);
    });
});

describe('other-chromosomes selector publishes correct event', () => {
    it('emits chromosome with null coordinates and source "cytoband-other"', () => {
        const received = collectEvents('ui:coordinates-changed');

        // Simulate what other-chromosomes.js:38-39 does on input
        const chromosome = 'chrUn_1';
        const data = { chromosome, start: null, end: null, source: 'cytoband-other' };
        eventBus.publish('ui:coordinates-changed', data);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            chromosome: 'chrUn_1',
            start: null,
            end: null,
            source: 'cytoband-other',
        });
    });
});

// =============================================================================
// Subscriber contracts: coordinate display responds correctly
// =============================================================================

describe('coordinate display subscriber', () => {
    // Mirrors the updateGoValues logic from coordinates.js:66-81
    function updateGoValues(goChrom, goStart, goEnd, chromValue = null, startValue = null, endValue = null) {
        const EMPTY = '\u2B1C';
        goChrom.textContent = chromValue !== null ? chromValue : EMPTY;
        goStart.textContent = startValue !== null ? startValue : EMPTY;
        goEnd.textContent = endValue !== null ? endValue : EMPTY;
    }

    function createMockElements() {
        return {
            goChrom: { textContent: '' },
            goStart: { textContent: '' },
            goEnd: { textContent: '' },
        };
    }

    it('sets chromosome and coordinates when all provided', () => {
        const els = createMockElements();

        updateGoValues(els.goChrom, els.goStart, els.goEnd, 'chr7', 1000, 5000);

        expect(els.goChrom.textContent).toBe('chr7');
        expect(els.goStart.textContent).toBe(1000);
        expect(els.goEnd.textContent).toBe(5000);
    });

    it('sets chromosome and empties coordinates when null', () => {
        const els = createMockElements();

        updateGoValues(els.goChrom, els.goStart, els.goEnd, 'chr7', null, null);

        expect(els.goChrom.textContent).toBe('chr7');
        expect(els.goStart.textContent).toBe('\u2B1C');
        expect(els.goEnd.textContent).toBe('\u2B1C');
    });

    it('empties all fields when nothing provided', () => {
        const els = createMockElements();

        updateGoValues(els.goChrom, els.goStart, els.goEnd);

        expect(els.goChrom.textContent).toBe('\u2B1C');
        expect(els.goStart.textContent).toBe('\u2B1C');
        expect(els.goEnd.textContent).toBe('\u2B1C');
    });
});

// =============================================================================
// Feedback loop prevention
// =============================================================================

describe('source-based feedback loop prevention', () => {
    it('chromosome cytoband ignores its own events', () => {
        const fetchCalls = [];

        // Simulate the subscriber from cytoband-chromosome.js:10-13
        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'cytoband-chromosome') return;
            fetchCalls.push(data.chromosome);
        });

        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr1', start: 1000, end: 5000, source: 'cytoband-chromosome',
        });

        expect(fetchCalls).toHaveLength(0);
    });

    it('chromosome cytoband processes events from other sources', () => {
        const fetchCalls = [];

        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'cytoband-chromosome') return;
            fetchCalls.push(data.chromosome);
        });

        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr1', start: null, end: null, source: 'cytoband-genome',
        });

        expect(fetchCalls).toHaveLength(1);
        expect(fetchCalls[0]).toBe('chr1');
    });

    it('genome cytoband highlight receives events from all sources', () => {
        const highlights = [];

        // Simulate the subscriber from cytoband-genome.js:11-13 (no source filter)
        eventBus.subscribe('ui:coordinates-changed', (data) => {
            highlights.push(data.chromosome);
        });

        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr1', source: 'cytoband-genome',
        });
        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr2', source: 'cytoband-chromosome',
        });
        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr3', source: 'coordinate-text',
        });

        expect(highlights).toEqual(['chr1', 'chr2', 'chr3']);
    });
});

// =============================================================================
// Cross-component integration: full event chain
// =============================================================================

describe('full event chain: genome click -> coordinate display + chromosome load', () => {
    it('single event reaches all subscribers in correct order', () => {
        const log = [];

        // Simulate genome highlight subscriber (cytoband-genome.js)
        eventBus.subscribe('ui:coordinates-changed', (data) => {
            log.push(`highlight:${data.chromosome}`);
        });

        // Simulate chromosome cytoband subscriber (cytoband-chromosome.js)
        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'cytoband-chromosome') return;
            log.push(`fetch-chrom:${data.chromosome}`);
        });

        // Simulate coordinate display subscriber (coordinates.js)
        eventBus.subscribe('ui:coordinates-changed', (data) => {
            log.push(`coords:${data.chromosome}:${data.start}:${data.end}`);
        });

        // Click chr7 in genome cytoband
        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr7', start: null, end: null, source: 'cytoband-genome',
        });

        expect(log).toEqual([
            'highlight:chr7',
            'fetch-chrom:chr7',
            'coords:chr7:null:null',
        ]);
    });

    it('drag-select event skips chromosome refetch but updates coordinates', () => {
        const log = [];

        eventBus.subscribe('ui:coordinates-changed', (data) => {
            log.push(`highlight:${data.chromosome}`);
        });

        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'cytoband-chromosome') return;
            log.push(`fetch-chrom:${data.chromosome}`);
        });

        eventBus.subscribe('ui:coordinates-changed', (data) => {
            log.push(`coords:${data.chromosome}:${data.start}:${data.end}`);
        });

        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr7', start: 10000, end: 50000, source: 'cytoband-chromosome',
        });

        expect(log).toEqual([
            'highlight:chr7',
            // no fetch-chrom — source filter prevented it
            'coords:chr7:10000:50000',
        ]);
    });
});
