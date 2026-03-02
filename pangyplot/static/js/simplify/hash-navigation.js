// URL hash: sync viewport state for shareable links.
// Format: #chrY:12345-67890

import { state } from './simplify-state.js';
import { xToBp, bpToX, xToY, getChromosome, isReady } from './spine.js';
import { getViewport } from './viewport.js';

let hashTimer = null;

export function updateUrlHash() {
    const chr = getChromosome();
    if (!isReady() || !chr) return;
    const vp = getViewport();
    const bpLeft = xToBp(vp.minX);
    const bpRight = xToBp(vp.maxX);
    if (bpLeft === null || bpRight === null) return;
    const start = Math.max(0, Math.round(bpLeft));
    const end = Math.round(bpRight);
    const hash = `#${chr}:${start}-${end}`;
    if (location.hash !== hash) {
        history.replaceState(null, '', hash);
    }
}

export function scheduleHashUpdate() {
    if (hashTimer) clearTimeout(hashTimer);
    hashTimer = setTimeout(updateUrlHash, 150);
}

export function parseUrlHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return null;
    // Format: chrY:12345-67890
    const m = hash.match(/^([^:]+):(\d+)-(\d+)$/);
    if (!m) return null;
    return { chrom: m[1], start: parseInt(m[2], 10), end: parseInt(m[3], 10) };
}

export function navigateToHash() {
    const params = parseUrlHash();
    if (!params || !isReady()) return false;

    const layoutLeft = bpToX(params.start);
    const layoutRight = bpToX(params.end);
    if (layoutLeft === null || layoutRight === null) return false;

    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;

    const layoutWidth = layoutRight - layoutLeft;
    if (layoutWidth <= 0) return false;

    // Fit the bp range horizontally with padding
    const pad = 40;
    state.zoom = (cw - pad * 2) / layoutWidth;

    // Center on the midpoint; use spine Y for vertical centering
    const midX = (layoutLeft + layoutRight) / 2;
    const midY = xToY(midX);
    if (midY === null) return false;

    state.panX = (cw / 2) - (midX * state.zoom);
    state.panY = (ch / 2) - (midY * state.zoom);
    return true;
}
