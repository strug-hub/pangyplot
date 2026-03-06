// Viewport bounds, canvas resize, fit-to-screen.

import { state } from '../simplify-state.js';
import { xToBp, bpToStep } from '../data/spine.js';

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
