// Gene-chain overlap mapping for polychain gene overlays.
// Computes which genes overlap which chains, with fractional coverage,
// and extracts sub-polylines for rendering.
// Independent from skeleton — fetches genes directly from the API.

import { cumulativeLengths, interpolateAtDist } from './polychain-adapter.js';
import { getGenePins, isGeneVisible } from '../../../skeleton/data/gene-data.js';
import { rgbStringToHex, stringToColor } from '@color-utils';
import { state } from '../../../simplify-state.js';
import { scheduleFrame } from '../../../utils/frame-scheduler.js';

function getGeneColor(name) {
    const pin = getGenePins().find(p => p.name === name);
    return pin ? pin.color : rgbStringToHex(stringToColor(name));
}

// Gene cache (independent from skeleton gene-data.js)
let geneCache = [];
let geneFetchedRange = null; // { chr, startBp, endBp }
let geneFetchController = null;

// Overlap cache
let cachedOverlaps = null;
let cachedChains = null;
let cachedGenes = null;
let cachedVisibilityKey = null;

/**
 * Fetch genes from the API for the given bp range.
 * Caches results; re-fetches only when range extends beyond cached.
 */
export async function fetchGenesForDetail(chr, genome, startBp, endBp) {
    if (!chr || !genome) return;

    // If cached range covers the request, skip
    if (geneFetchedRange && geneFetchedRange.chr === chr &&
        geneFetchedRange.startBp <= startBp && geneFetchedRange.endBp >= endBp) {
        return;
    }

    // Expand range by 100% margin
    const span = endBp - startBp;
    const fetchStart = Math.max(0, Math.floor(startBp - span));
    const fetchEnd = Math.ceil(endBp + span);

    if (geneFetchController) geneFetchController.abort();
    geneFetchController = new AbortController();
    const signal = geneFetchController.signal;

    try {
        let genes = await fetchGenes(genome, chr, fetchStart, fetchEnd, true, signal);
        if (genes.length === 0) {
            genes = await fetchGenes(genome, chr, fetchStart, fetchEnd, false, signal);
        }

        // Deduplicate
        const seen = new Set();
        geneCache = [];
        for (const g of genes) {
            if (!seen.has(g.id)) {
                seen.add(g.id);
                geneCache.push(g);
            }
        }
        geneFetchedRange = { chr, startBp: fetchStart, endBp: fetchEnd };
        // Invalidate overlap cache and trigger repaint
        cachedGenes = null;
        scheduleFrame();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.warn('[polychain-gene-map] fetch failed:', err);
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

export function clearDetailGeneCache() {
    geneCache = [];
    geneFetchedRange = null;
    cachedOverlaps = null;
    cachedChains = null;
    cachedGenes = null;
    cachedVisibilityKey = null;
}

/**
 * Build gene-chain overlap map.
 */
function buildGeneChainOverlaps(chains, genes) {
    const result = new Map();
    if (!genes || genes.length === 0) return result;

    for (const chain of chains) {
        if (chain.bpStart == null || chain.bpEnd == null) continue;
        const chainBpStart = chain.bpStart;
        const chainBpEnd = chain.bpEnd;
        const chainBpSpan = chainBpEnd - chainBpStart;
        if (chainBpSpan <= 0) continue;

        // Detect if polyline direction is reversed relative to bp direction.
        const reversed = chain.bpHead != null && chain.bpTail != null &&
            chain.bpHead > chain.bpTail;

        const overlaps = [];
        for (const gene of genes) {
            const name = gene.gene || gene.id;
            if (!isGeneVisible(name)) continue;
            if (gene.end <= chainBpStart || gene.start >= chainBpEnd) continue;

            let tStart = Math.max(0, (gene.start - chainBpStart) / chainBpSpan);
            let tEnd = Math.min(1, (gene.end - chainBpStart) / chainBpSpan);
            if (tEnd - tStart < 0.001) continue;

            if (reversed) {
                const flippedStart = 1 - tEnd;
                const flippedEnd = 1 - tStart;
                tStart = flippedStart;
                tEnd = flippedEnd;
            }

            overlaps.push({
                name,
                color: getGeneColor(name),
                tStart,
                tEnd,
            });
        }

        if (overlaps.length > 0) {
            result.set(chain.id, overlaps);
        }
    }
    return result;
}

/**
 * Extract a sub-polyline from fractional range [tStart, tEnd] along a polyline.
 */
export function extractSubPolyline(pl, tStart, tEnd) {
    if (!pl || pl.length < 2) return null;
    const cumLen = cumulativeLengths(pl);
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return null;

    const dStart = tStart * totalLen;
    const dEnd = tEnd * totalLen;

    const startPt = interpolateAtDist(pl, cumLen, dStart);
    const endPt = interpolateAtDist(pl, cumLen, dEnd);

    const sub = [startPt];
    for (let i = 1; i < pl.length - 1; i++) {
        if (cumLen[i] > dStart && cumLen[i] < dEnd) {
            sub.push([pl[i][0], pl[i][1]]);
        }
    }
    sub.push(endPt);
    return sub;
}

/**
 * Get gene-chain overlaps, rebuilding cache if chains or genes changed.
 */
export function getGeneChainOverlaps() {
    const dd = state.detailData;
    if (!dd) return new Map();

    const chains = dd.chains;

    // Build a key from visibility + colors to detect changes
    const pins = getGenePins();
    const visKey = pins.map(p => (isGeneVisible(p.name) ? '1' : '0') + p.color).join();
    if (cachedOverlaps && cachedChains === chains && cachedGenes === geneCache && cachedVisibilityKey === visKey) {
        return cachedOverlaps;
    }

    cachedChains = chains;
    cachedGenes = geneCache;
    cachedVisibilityKey = visKey;
    cachedOverlaps = buildGeneChainOverlaps(chains, geneCache);
    return cachedOverlaps;
}
