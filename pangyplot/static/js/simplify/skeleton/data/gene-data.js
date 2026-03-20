// Gene landmark data: dynamic API fetch with caching and MANE Select filter.

import { bpToX, xToY } from '../../engines/reference-spine-engine.js';
import { rgbStringToHex, stringToColor } from '@color-utils';
import { state } from '../../simplify-state.js';
import { populateGeneAnnotationsTable } from '../../../graph/engines/gene-annotation/gene-annotation-ui.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';

let genePins = [];
let geneCache = [];
const hiddenGenes = new Set();
const customColors = new Map();  // gene name → user-set color (persists across rebuilds)
let fetchedRange = null;    // { chr, startBp, endBp } — completed fetch
let pendingRange = null;    // { chr, startBp, endBp } — in-flight fetch
let fetchController = null;
let detailOverride = false; // true when pins are positioned by detail data
let spinePlaced = false;    // true when pins are placed from spine (skip redundant re-place)
let detailChainKey = null;  // tracks which chain data was last used for placement

export function getGenePins() { return genePins; }
export function isGeneVisible(name) { return !hiddenGenes.has(name); }

export function clearGeneCache() {
    genePins = [];
    geneCache = [];
    hiddenGenes.clear();
    customColors.clear();
    fetchedRange = null;
    pendingRange = null;
    spinePlaced = false;
    detailChainKey = null;
    if (fetchController) {
        fetchController.abort();
        fetchController = null;
    }
}

export async function fetchAndPlaceGenes(chr, genome, startBp, endBp) {
    if (!chr || !genome) return;

    // If cached or in-flight range covers the request, skip
    for (const range of [fetchedRange, pendingRange]) {
        if (range && range.chr === chr &&
            range.startBp <= startBp && range.endBp >= endBp) {
            if (range === fetchedRange && !detailOverride && !spinePlaced) placeGenes();
            return;
        }
    }

    // Expand range by 100% margin on each side
    const span = endBp - startBp;
    const fetchStart = Math.max(0, Math.floor(startBp - span));
    const fetchEnd = Math.ceil(endBp + span);

    // Abort any in-flight request
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();
    const signal = fetchController.signal;
    pendingRange = { chr, startBp: fetchStart, endBp: fetchEnd };

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
        pendingRange = null;
        spinePlaced = false;
        detailChainKey = null;
        if (!detailOverride) placeGenes();
    } catch (err) {
        pendingRange = null;
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
        const color = customColors.get(name) || rgbStringToHex(stringToColor(name));

        genePins.push({ name, startBp, endBp, startX, endX, midX, refY, minY, maxY, color });
    }
    spinePlaced = true;
    populateSimplifyGeneTable();
}

function populateSimplifyGeneTable() {
    const entries = geneCache.map(gene => {
        const name = gene.gene || gene.id;
        const pin = genePins.find(p => p.name === name);
        const color = pin ? pin.color : rgbStringToHex(stringToColor(name));
        return {
            id: gene.id,
            name,
            color,
            visible: !hiddenGenes.has(name),
            onToggle: (visible) => {
                if (visible) hiddenGenes.delete(name);
                else hiddenGenes.add(name);
                scheduleFrame();
            },
            onColor: (newColor) => {
                customColors.set(name, newColor);
                if (pin) pin.color = newColor;
                scheduleFrame();
            },
        };
    });
    populateGeneAnnotationsTable(entries, { showExonColumn: false });
}

/**
 * Reposition gene pins using detail chain data for more accurate placement.
 * Skips if the same chain data was already used.
 */
export function placeGenesFromDetail(chains) {
    if (!chains || chains.length === 0 || genePins.length === 0) return;

    // Build a simple key from chain count + first/last polyline endpoints
    // to detect whether chain data actually changed
    const first = chains[0].polyline;
    const last = chains[chains.length - 1].polyline;
    const key = chains.length + ':'
        + (first && first.length > 0 ? first[0][0].toFixed(1) : '')
        + (last && last.length > 0 ? last[last.length - 1][0].toFixed(1) : '');

    if (key === detailChainKey) return;
    detailChainKey = key;

    detailOverride = true;
    spinePlaced = false;

    // Build sorted bp→X anchors from depth-0 chain endpoints only
    const anchors = [];
    for (const chain of chains) {
        if (chain.bpStart == null || chain.bpEnd == null) continue;
        if ((chain.depth || 0) > 0) continue;
        const pl = chain.polyline;
        if (!pl || pl.length < 2) continue;

        const headBp = chain.bpHead ?? chain.bpStart;
        const tailBp = chain.bpTail ?? chain.bpEnd;
        anchors.push({ bp: headBp, x: pl[0][0] });
        anchors.push({ bp: tailBp, x: pl[pl.length - 1][0] });
    }
    if (anchors.length < 2) return;

    // Sort by bp, deduplicate
    anchors.sort((a, b) => a.bp - b.bp);
    const bps = [anchors[0].bp];
    const xs = [anchors[0].x];
    for (let i = 1; i < anchors.length; i++) {
        if (anchors[i].bp > bps[bps.length - 1]) {
            bps.push(anchors[i].bp);
            xs.push(anchors[i].x);
        }
    }

    function detailBpToX(bp) {
        if (bp <= bps[0]) return xs[0];
        if (bp >= bps[bps.length - 1]) return xs[xs.length - 1];
        let lo = 0, hi = bps.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (bps[mid] <= bp) lo = mid; else hi = mid;
        }
        const t = (bp - bps[lo]) / (bps[hi] - bps[lo]);
        return xs[lo] + t * (xs[hi] - xs[lo]);
    }

    // Reposition X from detail chains, keep Y from spine
    for (const pin of genePins) {
        pin.startX = detailBpToX(pin.startBp);
        pin.endX = detailBpToX(pin.endBp);
        pin.midX = (pin.startX + pin.endX) / 2;
        pin.refY = xToY(pin.midX);

        const nSamples = Math.max(3, Math.ceil(Math.abs(pin.endX - pin.startX) / 20));
        let minY = Infinity, maxY = -Infinity;
        const lo = Math.min(pin.startX, pin.endX);
        const hi = Math.max(pin.startX, pin.endX);
        for (let s = 0; s <= nSamples; s++) {
            const sx = lo + (hi - lo) * s / nSamples;
            const sy = xToY(sx);
            if (sy < minY) minY = sy;
            if (sy > maxY) maxY = sy;
        }
        pin.minY = minY;
        pin.maxY = maxY;
    }
}

/**
 * Blend gene pin positions from detail toward spine by factor t (0=detail, 1=spine).
 * Called each frame during fade-out for smooth interpolation.
 */
export function blendGenePinsToSpine(t) {
    for (const pin of genePins) {
        const spineStartX = bpToX(pin.startBp);
        const spineEndX = bpToX(pin.endBp);
        if (spineStartX === null || spineEndX === null) continue;

        pin.startX = pin.startX + (spineStartX - pin.startX) * t;
        pin.endX = pin.endX + (spineEndX - pin.endX) * t;
        pin.midX = (pin.startX + pin.endX) / 2;
        pin.refY = xToY(pin.midX);

        const nSamples = Math.max(3, Math.ceil(Math.abs(pin.endX - pin.startX) / 20));
        let minY = Infinity, maxY = -Infinity;
        const lo = Math.min(pin.startX, pin.endX);
        const hi = Math.max(pin.startX, pin.endX);
        for (let s = 0; s <= nSamples; s++) {
            const sx = lo + (hi - lo) * s / nSamples;
            const sy = xToY(sx);
            if (sy < minY) minY = sy;
            if (sy > maxY) maxY = sy;
        }
        pin.minY = minY;
        pin.maxY = maxY;
    }
}

/**
 * Restore gene pins to spine-based positioning mode.
 * @param {boolean} [recompute=true] - If false, just clears the override flag
 *   without snapping positions (use when blend already placed pins at spine).
 */
export function placeGenesFromSpine(recompute = true) {
    detailOverride = false;
    detailChainKey = null;
    if (recompute) {
        spinePlaced = false;
        placeGenes();
    } else {
        spinePlaced = true;
    }
}
