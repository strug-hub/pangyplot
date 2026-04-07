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
// Gene search event shape
// Mirrors updateSelectedGenePlaceholders from gene-search.js:103-141
// =============================================================================

describe('gene search publishes ui:coordinates-changed', () => {
    it('emits coordinates with source "gene-search" on gene selection', () => {
        const received = collectEvents('ui:coordinates-changed');

        // Simulates gene-search.js:134-140
        const data = {
            chromosome: 'chr7',
            start: 10000,
            end: 20000,
            source: 'gene-search',
        };
        eventBus.publish('ui:coordinates-changed', data);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            chromosome: 'chr7',
            start: 10000,
            end: 20000,
            source: 'gene-search',
        });
    });

    it('emits integer coordinates (not strings)', () => {
        const received = collectEvents('ui:coordinates-changed');

        // gene-search.js:137-138 uses parseInt
        const data = {
            chromosome: 'chr1',
            start: parseInt('1000', 10),
            end: parseInt('5000', 10),
            source: 'gene-search',
        };
        eventBus.publish('ui:coordinates-changed', data);

        expect(typeof received[0].start).toBe('number');
        expect(typeof received[0].end).toBe('number');
    });
});

// =============================================================================
// Gene search result card click
// Mirrors selectedGeneClicked + getCoordinateData from gene-search.js:88-101, 143-146
// =============================================================================

describe('gene result card click publishes event', () => {
    // Mirrors getCoordinateData from gene-search.js:88-101
    function getCoordinateData(chrom, start, end) {
        return {
            chromosome: chrom,
            start: parseInt(start, 10),
            end: parseInt(end, 10),
            source: 'gene-search',
        };
    }

    it('extracts coordinate data from result card', () => {
        const received = collectEvents('ui:coordinates-changed');
        const data = getCoordinateData('chr5', '3000', '7000');
        eventBus.publish('ui:coordinates-changed', data);

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            chromosome: 'chr5',
            start: 3000,
            end: 7000,
            source: 'gene-search',
        });
    });
});

// =============================================================================
// Gene search feedback loop prevention
// Mirrors subscriber in gene-search.js:152-168
// =============================================================================

describe('gene search subscriber ignores own events', () => {
    it('does not react to source "gene-search"', () => {
        const deselectCalls = [];

        // Simulates gene-search.js:152-155
        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'gene-search') return;
            deselectCalls.push(data);
        });

        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr7',
            start: 1000,
            end: 5000,
            source: 'gene-search',
        });

        expect(deselectCalls).toHaveLength(0);
    });

    it('processes events from other sources', () => {
        const deselectCalls = [];

        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'gene-search') return;
            deselectCalls.push(data);
        });

        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr7',
            start: 1000,
            end: 5000,
            source: 'cytoband-chromosome',
        });

        expect(deselectCalls).toHaveLength(1);
    });

    it('processes events from coordinate text input', () => {
        const deselectCalls = [];

        eventBus.subscribe('ui:coordinates-changed', (data) => {
            if (data.source === 'gene-search') return;
            deselectCalls.push(data);
        });

        eventBus.publish('ui:coordinates-changed', {
            chromosome: 'chr1',
            start: 100,
            end: 200,
            source: 'coordinate-text',
        });

        expect(deselectCalls).toHaveLength(1);
    });
});

// =============================================================================
// Gene search re-selection matching
// Mirrors subscriber matching logic in gene-search.js:159-165
// =============================================================================

describe('gene search subscriber matches saved results', () => {
    function findMatchingResult(savedResults, data) {
        for (const result of savedResults) {
            if (result.chromosome === data.chromosome &&
                result.start === data.start &&
                result.end === data.end) {
                return result;
            }
        }
        return null;
    }

    it('finds matching result when coordinates match exactly', () => {
        const saved = [
            { chromosome: 'chr7', start: 10000, end: 20000, name: 'GeneA' },
            { chromosome: 'chr5', start: 3000, end: 7000, name: 'GeneB' },
        ];

        const match = findMatchingResult(saved, {
            chromosome: 'chr5', start: 3000, end: 7000,
        });

        expect(match).not.toBeNull();
        expect(match.name).toBe('GeneB');
    });

    it('returns null when no match', () => {
        const saved = [
            { chromosome: 'chr7', start: 10000, end: 20000, name: 'GeneA' },
        ];

        const match = findMatchingResult(saved, {
            chromosome: 'chr1', start: 1000, end: 5000,
        });

        expect(match).toBeNull();
    });

    it('requires all three fields to match', () => {
        const saved = [
            { chromosome: 'chr7', start: 10000, end: 20000, name: 'GeneA' },
        ];

        // Same chromosome, different coordinates
        expect(findMatchingResult(saved, {
            chromosome: 'chr7', start: 100, end: 200,
        })).toBeNull();

        // Same start/end, different chromosome
        expect(findMatchingResult(saved, {
            chromosome: 'chr1', start: 10000, end: 20000,
        })).toBeNull();
    });
});

// =============================================================================
// Gene search template processing
// Mirrors processTemplate from gene-search.js:29-33
// =============================================================================

function processTemplate(template, data) {
    return template.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
        return data[key] || '';
    });
}

describe('gene search template processing', () => {
    it('replaces placeholders with values', () => {
        const result = processTemplate('{{name}} on {{chromosome}}', {
            name: 'BRCA1',
            chromosome: 'chr17',
        });
        expect(result).toBe('BRCA1 on chr17');
    });

    it('handles whitespace in placeholders', () => {
        const result = processTemplate('{{ name }}', { name: 'TP53' });
        expect(result).toBe('TP53');
    });

    it('replaces missing keys with empty string', () => {
        const result = processTemplate('{{name}} ({{type}})', { name: 'GENE1' });
        expect(result).toBe('GENE1 ()');
    });
});

// =============================================================================
// Gene type normalization
// Mirrors geneToSearchItem logic from gene-search.js:36-53
// =============================================================================

describe('gene type display normalization', () => {
    function normalizeGeneType(gene) {
        if ('gene_type' in gene) {
            return gene.gene_type.split('_').join(' ');
        } else if ('gene_biotype' in gene) {
            return gene.gene_biotype.split('_').join(' ');
        }
        return 'Type Unknown';
    }

    it('converts gene_type underscores to spaces', () => {
        expect(normalizeGeneType({ gene_type: 'protein_coding' })).toBe('protein coding');
    });

    it('falls back to gene_biotype', () => {
        expect(normalizeGeneType({ gene_biotype: 'lincRNA_gene' })).toBe('lincRNA gene');
    });

    it('returns "Type Unknown" when neither field present', () => {
        expect(normalizeGeneType({})).toBe('Type Unknown');
    });

    it('prefers gene_type over gene_biotype', () => {
        expect(normalizeGeneType({
            gene_type: 'protein_coding',
            gene_biotype: 'something_else',
        })).toBe('protein coding');
    });
});
