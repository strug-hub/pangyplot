// URL hash: sync viewport state for shareable links.
// Format: #chrY:12345-67890

import { state } from '../../simplify-state.js';
import { layoutToBp, bpToLayout, isReady } from '../reference-spine-engine.js';
import { getViewport } from '../../render/viewport.js';

let hashTimer = null;

export function updateUrlHash() {
    const chr = state.chromosome;
    if (!isReady() || !chr) return;
    const vp = getViewport();
    const midY = (vp.minY + vp.maxY) / 2;
    const bpLeft = layoutToBp(vp.minX, midY);
    const bpRight = layoutToBp(vp.maxX, midY);
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

export function navigateToRegion(startBp, endBp) {
    if (!isReady()) return false;

    const leftPt = bpToLayout(startBp);
    const rightPt = bpToLayout(endBp);
    if (!leftPt || !rightPt) return false;

    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;

    const layoutWidth = rightPt.x - leftPt.x;
    if (layoutWidth <= 0) return false;

    // Fit the bp range horizontally with padding
    const pad = 40;
    state.zoom = (cw - pad * 2) / layoutWidth;

    // Center on the midpoint
    const midBp = (startBp + endBp) / 2;
    const midPt = bpToLayout(midBp);
    if (!midPt) return false;

    state.panX = (cw / 2) - (midPt.x * state.zoom);
    state.panY = (ch / 2) - (midPt.y * state.zoom);
    return true;
}

export function navigateToHash() {
    const params = parseUrlHash();
    if (!params || !isReady()) return false;
    return navigateToRegion(params.start, params.end);
}
