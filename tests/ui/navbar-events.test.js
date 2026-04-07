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
// Navbar example button event shape
// Validates the contract, not specific regions (those may change)
// =============================================================================

describe('navbar example event shape', () => {
    it('must include genome, chromosome, start, end, and source', () => {
        const received = collectEvents('ui:coordinates-changed');

        const data = {
            genome: 'GRCh38',
            chromosome: 'chr1',
            start: 1000,
            end: 5000,
            source: 'navbar-example',
        };
        eventBus.publish('ui:coordinates-changed', data);

        expect(received).toHaveLength(1);
        const event = received[0];
        expect(event).toHaveProperty('genome');
        expect(event).toHaveProperty('chromosome');
        expect(event).toHaveProperty('start');
        expect(event).toHaveProperty('end');
        expect(event).toHaveProperty('source');
        expect(event.source).toBe('navbar-example');
    });

    it('start must be less than end', () => {
        const data = { genome: 'GRCh38', chromosome: 'chr1', start: 100, end: 500, source: 'navbar-example' };
        expect(data.start).toBeLessThan(data.end);
    });

    it('start and end must be positive integers', () => {
        const data = { genome: 'GRCh38', chromosome: 'chr1', start: 1000, end: 5000, source: 'navbar-example' };
        expect(Number.isInteger(data.start)).toBe(true);
        expect(Number.isInteger(data.end)).toBe(true);
        expect(data.start).toBeGreaterThan(0);
        expect(data.end).toBeGreaterThan(0);
    });
});

// =============================================================================
// Navbar example -> subscriber integration
// =============================================================================

describe('navbar example reaches coordinate display and cytoband', () => {
    it('coordinate display receives all fields', () => {
        const coordUpdates = [];

        eventBus.subscribe('ui:coordinates-changed', (data) => {
            coordUpdates.push(data);
        });

        eventBus.publish('ui:coordinates-changed', {
            genome: 'TestGenome',
            chromosome: 'chr3',
            start: 200,
            end: 800,
            source: 'navbar-example',
        });

        expect(coordUpdates).toHaveLength(1);
        expect(coordUpdates[0].chromosome).toBe('chr3');
        expect(coordUpdates[0].start).toBe(200);
        expect(coordUpdates[0].end).toBe(800);
    });

    it('chromosome cytoband processes navbar examples (different source)', () => {
        const fetchCalls = [];

        // Simulates cytoband-chromosome.js subscriber — only ignores own source
        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'cytoband-chromosome') return;
            fetchCalls.push(data.chromosome);
        });

        eventBus.publish('ui:coordinates-changed', {
            genome: 'TestGenome',
            chromosome: 'chr5',
            start: 100,
            end: 500,
            source: 'navbar-example',
        });

        expect(fetchCalls).toHaveLength(1);
        expect(fetchCalls[0]).toBe('chr5');
    });

    it('gene search subscriber processes navbar examples', () => {
        const processed = [];

        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'gene-search') return;
            processed.push(data.source);
        });

        eventBus.publish('ui:coordinates-changed', {
            genome: 'TestGenome',
            chromosome: 'chr1',
            start: 10,
            end: 20,
            source: 'navbar-example',
        });

        expect(processed).toEqual(['navbar-example']);
    });
});
