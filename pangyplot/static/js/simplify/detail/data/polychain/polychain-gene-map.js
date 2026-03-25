// Gene-chain overlap mapping for polychain gene overlays.
// Computes which genes overlap which chains, with fractional coverage,
// and extracts sub-polylines for rendering.
// Uses the shared gene cache from gene-data.js (loaded at chromosome init).

import { cumulativeLengths, interpolateAtDist } from './polychain-adapter.js';
import { getGenePins, getGeneCache, isGeneVisible } from '../../../skeleton/data/gene-data.js';
import { rgbStringToHex, stringToColor } from '@color-utils';
import { state } from '../../../simplify-state.js';

function getGeneColor(name) {
    const pin = getGenePins().find(p => p.name === name);
    return pin ? pin.color : rgbStringToHex(stringToColor(name));
}

// Overlap cache
let cachedOverlaps = null;
let cachedChains = null;
let cachedGenes = null;
let cachedVisibilityKey = null;

export function clearDetailGeneCache() {
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
    const genes = getGeneCache();

    // Build a key from visibility + colors to detect changes
    const pins = getGenePins();
    const visKey = pins.map(p => (isGeneVisible(p.name) ? '1' : '0') + p.color).join();
    if (cachedOverlaps && cachedChains === chains && cachedGenes === genes && cachedVisibilityKey === visKey) {
        return cachedOverlaps;
    }

    cachedChains = chains;
    cachedGenes = genes;
    cachedVisibilityKey = visKey;
    cachedOverlaps = buildGeneChainOverlaps(chains, genes);
    return cachedOverlaps;
}
