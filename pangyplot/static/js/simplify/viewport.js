// Viewport bounds, bounding-box precomputation, canvas resize, fit-to-screen.

import { state } from './simplify-state.js';
import { xToBp, bpToStep } from './spine.js';

export function precomputeBboxes() {
    state.levelBboxes = [];
    for (const level of state.data.levels) {
        const n = level.polylines.length;
        const arr = new Float64Array(n * 4);
        for (let i = 0; i < n; i++) {
            const pl = level.polylines[i];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const [x, y] of pl) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            const o = i * 4;
            arr[o] = minX; arr[o+1] = minY; arr[o+2] = maxX; arr[o+3] = maxY;
        }
        state.levelBboxes.push(arr);
    }
}

export function computeBounds() {
    const level = state.data.levels[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pl of level.polylines) {
        for (const [x, y] of pl) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    state.dataBounds = { minX, maxX, minY, maxY };
}

export function getViewport() {
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;
    return {
        minX: -state.panX / state.zoom,
        minY: -state.panY / state.zoom,
        maxX: (cw - state.panX) / state.zoom,
        maxY: (ch - state.panY) / state.zoom,
    };
}

export function viewportStepCount() {
    const vp = getViewport();
    const bpLeft = xToBp(vp.minX);
    const bpRight = xToBp(vp.maxX);
    if (bpLeft === null || bpRight === null) return Infinity;
    return bpToStep(bpRight) - bpToStep(bpLeft);
}

export function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    const dpr = window.devicePixelRatio || 1;
    state.canvas.width = container.clientWidth * dpr;
    state.canvas.height = container.clientHeight * dpr;
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function fitToScreen() {
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;
    const dw = state.dataBounds.maxX - state.dataBounds.minX;
    const dh = state.dataBounds.maxY - state.dataBounds.minY;
    if (dw === 0 || dh === 0) return;
    const pad = 40;
    state.zoom = Math.min((cw - pad * 2) / dw, (ch - pad * 2) / dh);
    state.panX = (cw / 2) - ((state.dataBounds.minX + dw / 2) * state.zoom);
    state.panY = (ch / 2) - ((state.dataBounds.minY + dh / 2) * state.zoom);
}
