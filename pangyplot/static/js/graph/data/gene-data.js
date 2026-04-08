// Gene landmark data: placement, visibility, starring, colors.
// Gene cache is populated once at chromosome load by chromosome-loader.js.
// Placement runs on viewport change; rendering handles density culling.

import { bpToLayout, layoutToBp } from '../engines/reference-spine-engine.js';
import { rgbStringToHex, stringToColor } from '@color-utils';
import { state } from '../state.js';
import { populateGeneAnnotationsTable } from '../ui/gene-annotation-ui.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { bumpGenePinVersion } from '../skeleton/render/gene-polyline-overlay.js';
import { getCustomAnnotationEntries, clearCustomAnnotations, setTableRefreshFn } from './custom-annotation-data.js';

let genePins = [];
let geneCache = [];
const hiddenGenes = new Set();
const starredGenes = new Set();
const customColors = new Map();
let detailOverride = false;
let spinePlaced = false;
let detailChainKey = null;

export function getGenePins() { return genePins; }
export function getGeneCache() { return geneCache; }
export function isGeneVisible(name) { return !hiddenGenes.has(name); }
export function isGeneStarred(name) { return starredGenes.has(name); }
export function toggleGeneStar(name) {
    if (starredGenes.has(name)) starredGenes.delete(name);
    else starredGenes.add(name);
    scheduleFrame();
}

/**
 * Initialize the gene cache with pre-fetched gene data.
 * Called once per chromosome load from chromosome-loader.js.
 */
export function initGeneCache(genes) {
    const seen = new Set();
    geneCache = [];
    for (const g of genes) {
        if (!seen.has(g.id)) {
            seen.add(g.id);
            geneCache.push(g);
        }
    }
    genePins = [];
    spinePlaced = false;
    detailChainKey = null;
    detailOverride = false;
    placeGenes();
}

export function clearGeneCache() {
    genePins = [];
    geneCache = [];
    hiddenGenes.clear();
    starredGenes.clear();
    customColors.clear();
    spinePlaced = false;
    detailChainKey = null;
    clearCustomAnnotations();
}

/**
 * Re-place genes for the current viewport. No fetch — just rebuilds
 * genePins from the full cache. Call on viewport change if needed.
 */
export function placeGenesForViewport() {
    if (!detailOverride && !spinePlaced) placeGenes();
}

let placeGenesAbort = null;

function placeGenePin(gene) {
    const startBp = gene.start;
    const endBp = gene.end;
    const startPt = bpToLayout(startBp);
    const endPt = bpToLayout(endBp);
    if (!startPt || !endPt) return null;

    const startX = startPt.x;
    const endX = endPt.x;
    const midBp = (startBp + endBp) / 2;
    const midPt = bpToLayout(midBp);
    const midX = midPt.x;
    const refY = midPt.y;

    const nSamples = Math.min(10, Math.max(3, Math.ceil(Math.abs(endX - startX) / 20)));
    let minY = Infinity, maxY = -Infinity;
    for (let s = 0; s <= nSamples; s++) {
        const sampleBp = startBp + (endBp - startBp) * s / nSamples;
        const pt = bpToLayout(sampleBp);
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
    }
    const name = gene.gene || gene.id;
    const color = customColors.get(name) || rgbStringToHex(stringToColor(name));
    const priority = gene._priority ?? (gene._priority = Math.random());

    return { name, startBp, endBp, startX, endX, midX, refY, minY, maxY, color, priority };
}

function placeGenes() {
    // Cancel any in-progress async placement
    if (placeGenesAbort) placeGenesAbort.abort = true;

    // Sort genes by bp distance from viewport center
    const vpMinX = -state.panX / state.zoom;
    const vpMaxX = (state.canvas.width / (window.devicePixelRatio || 1) - state.panX) / state.zoom;
    const vpMidY = -(state.panY / state.zoom) + (state.canvas.height / (window.devicePixelRatio || 1)) / state.zoom / 2;
    const centerBp = layoutToBp((vpMinX + vpMaxX) / 2, vpMidY) || 0;

    const sorted = [...geneCache];
    sorted.sort((a, b) => {
        const aMid = (a.start + a.end) / 2;
        const bMid = (b.start + b.end) / 2;
        return Math.abs(aMid - centerBp) - Math.abs(bMid - centerBp);
    });

    // Place first batch synchronously (viewport genes)
    genePins = [];
    const SYNC_BUDGET_MS = 8;
    const t0 = performance.now();
    let i = 0;
    for (; i < sorted.length; i++) {
        const pin = placeGenePin(sorted[i]);
        if (pin) genePins.push(pin);
        if (performance.now() - t0 > SYNC_BUDGET_MS) { i++; break; }
    }
    spinePlaced = true;
    bumpGenePinVersion();

    // Place remaining genes async in batches
    if (i < sorted.length) {
        const token = { abort: false };
        placeGenesAbort = token;
        const remaining = sorted.slice(i);
        let idx = 0;
        const BATCH = 50;

        function processBatch() {
            if (token.abort) return;
            const end = Math.min(idx + BATCH, remaining.length);
            for (; idx < end; idx++) {
                const pin = placeGenePin(remaining[idx]);
                if (pin) genePins.push(pin);
            }
            bumpGenePinVersion();
            scheduleFrame();
            if (idx < remaining.length) {
                requestAnimationFrame(processBatch);
            } else {
                placeGenesAbort = null;
                populateGeneTable();
            }
        }
        requestAnimationFrame(processBatch);
    } else {
        populateGeneTable();
    }
}

export function populateGeneTable() {
    const pinMap = new Map(genePins.map(p => [p.name, p]));
    const entries = geneCache.map(gene => {
        const name = gene.gene || gene.id;
        const pin = pinMap.get(name);
        const color = pin ? pin.color : rgbStringToHex(stringToColor(name));
        return {
            id: gene.id,
            name,
            color,
            visible: !hiddenGenes.has(name),
            starred: starredGenes.has(name),
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
            onStar: () => {
                toggleGeneStar(name);
                populateGeneTable();
            },
        };
    });
    entries.push(...getCustomAnnotationEntries());
    populateGeneAnnotationsTable(entries, { showExonColumn: false, showStarColumn: true });
}

setTableRefreshFn(populateGeneTable);

/**
 * Reposition gene pins using detail chain data for more accurate placement.
 * Skips if the same chain data was already used.
 */
export function placeGenesFromDetail(chains) {
    if (!chains || chains.length === 0 || genePins.length === 0) return;

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

    for (const pin of genePins) {
        pin.startX = detailBpToX(pin.startBp);
        pin.endX = detailBpToX(pin.endBp);
        pin.midX = (pin.startX + pin.endX) / 2;
        const midPt = bpToLayout((pin.startBp + pin.endBp) / 2);
        pin.refY = midPt ? midPt.y : pin.refY;

        const nSamples = Math.max(3, Math.ceil(Math.abs(pin.endX - pin.startX) / 20));
        let minY = Infinity, maxY = -Infinity;
        for (let s = 0; s <= nSamples; s++) {
            const sampleBp = pin.startBp + (pin.endBp - pin.startBp) * s / nSamples;
            const pt = bpToLayout(sampleBp);
            if (pt && pt.y < minY) minY = pt.y;
            if (pt && pt.y > maxY) maxY = pt.y;
        }
        pin.minY = minY;
        pin.maxY = maxY;
    }
    bumpGenePinVersion();
}

/**
 * Blend gene pin positions from detail toward spine by factor t (0=detail, 1=spine).
 * Called each frame during fade-out for smooth interpolation.
 */
export function blendGenePinsToSpine(t) {
    for (const pin of genePins) {
        const startPt = bpToLayout(pin.startBp);
        const endPt = bpToLayout(pin.endBp);
        if (!startPt || !endPt) continue;

        pin.startX = pin.startX + (startPt.x - pin.startX) * t;
        pin.endX = pin.endX + (endPt.x - pin.endX) * t;
        pin.midX = (pin.startX + pin.endX) / 2;
        const midPt = bpToLayout((pin.startBp + pin.endBp) / 2);
        pin.refY = midPt ? midPt.y : pin.refY;

        const nSamples = Math.max(3, Math.ceil(Math.abs(pin.endX - pin.startX) / 20));
        let minY = Infinity, maxY = -Infinity;
        for (let s = 0; s <= nSamples; s++) {
            const sampleBp = pin.startBp + (pin.endBp - pin.startBp) * s / nSamples;
            const pt = bpToLayout(sampleBp);
            if (pt && pt.y < minY) minY = pt.y;
            if (pt && pt.y > maxY) maxY = pt.y;
        }
        pin.minY = minY;
        pin.maxY = maxY;
    }
    bumpGenePinVersion();
}

/**
 * Restore gene pins to spine-based positioning mode.
 */
export function placeGenesFromSpine(recompute = true) {
    detailOverride = false;
    detailChainKey = null;
    if (recompute) {
        spinePlaced = false;
        placeGenes();
    } else {
        spinePlaced = true;
        populateGeneTable();
    }
}
