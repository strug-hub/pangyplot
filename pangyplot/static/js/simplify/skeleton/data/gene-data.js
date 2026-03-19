// Gene landmark data: dynamic API fetch with caching and MANE Select filter.

import { bpToX, xToY } from '../../engines/reference-spine-engine.js';
import { geneColor } from '../../utils/color-hash.js';
import { state } from '../../simplify-state.js';

let genePins = [];
let geneCache = [];
let fetchedRange = null;   // { chr, startBp, endBp }
let fetchController = null;

export function getGenePins() { return genePins; }

export function clearGeneCache() {
    genePins = [];
    geneCache = [];
    fetchedRange = null;
    if (fetchController) {
        fetchController.abort();
        fetchController = null;
    }
}

export async function fetchAndPlaceGenes(chr, genome, startBp, endBp) {
    if (!chr || !genome) return;

    // If cached range covers the request, just re-place
    if (fetchedRange && fetchedRange.chr === chr &&
        fetchedRange.startBp <= startBp && fetchedRange.endBp >= endBp) {
        placeGenes();
        return;
    }

    // Expand range by 100% margin on each side
    const span = endBp - startBp;
    const fetchStart = Math.max(0, Math.floor(startBp - span));
    const fetchEnd = Math.ceil(endBp + span);

    // Abort any in-flight request
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();
    const signal = fetchController.signal;

    try {
        let genes = await fetchGenes(genome, chr, fetchStart, fetchEnd, true, signal);

        // Fallback: if MANE Select returned nothing, fetch all genes
        if (genes.length === 0) {
            genes = await fetchGenes(genome, chr, fetchStart, fetchEnd, false, signal);
        }

        // Deduplicate by gene id
        const seen = new Set();
        geneCache = [];
        for (const g of genes) {
            if (!seen.has(g.id)) {
                seen.add(g.id);
                geneCache.push(g);
            }
        }

        fetchedRange = { chr, startBp: fetchStart, endBp: fetchEnd };
        placeGenes();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.warn('[gene-data] fetch failed:', err);
        }
    }
}

async function fetchGenes(genome, chr, start, end, maneOnly, signal) {
    const params = new URLSearchParams({
        genome, chromosome: chr,
        start: String(start), end: String(end),
    });
    if (maneOnly) params.set('mane_only', 'true');

    const resp = await fetch(`/genes?${params}`, { signal });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.genes || [];
}

function placeGenes() {
    genePins = [];
    for (const gene of geneCache) {
        const startBp = gene.start;
        const endBp = gene.end;
        const startX = bpToX(startBp);
        const endX = bpToX(endBp);
        if (startX === null || endX === null) continue;

        const midX = (startX + endX) / 2;
        const refY = xToY(midX);

        // Sample spine y at multiple points to capture curves accurately
        const nSamples = Math.max(3, Math.ceil((endX - startX) / 20));
        let minY = Infinity, maxY = -Infinity;
        for (let s = 0; s <= nSamples; s++) {
            const sx = startX + (endX - startX) * s / nSamples;
            const sy = xToY(sx);
            if (sy < minY) minY = sy;
            if (sy > maxY) maxY = sy;
        }
        const name = gene.gene || gene.id;
        const color = geneColor(name);

        genePins.push({ name, startBp, endBp, startX, endX, midX, refY, minY, maxY, color });
    }
}
