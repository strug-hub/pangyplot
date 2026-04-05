// Debug HUD: screen-space overlays drawn on every frame in debug mode.
// View switcher bar, FPS counter, alpha decay, scale bar, timing breakdown.

import { state } from '../simplify-state.js';
import { getAlpha } from '../detail/engines/force-engine.js';
import { getViews, getActiveView } from './debug-orchestrator.js';

let _fpsFrames = 0;
let _fpsLast = performance.now();
let _fpsDisplay = 0;
let _timingsHistory = [];
let _timingsAvg = null;

export function recordTimings(timings) {
    _timingsHistory.push(timings);
    if (_timingsHistory.length > 5) _timingsHistory.shift();
    const avg = new Map();
    for (const frame of _timingsHistory) {
        for (const [label, ms] of frame) {
            avg.set(label, (avg.get(label) || 0) + ms);
        }
    }
    const n = _timingsHistory.length;
    _timingsAvg = [...avg.entries()].map(([label, total]) => [label, total / n]);
}

export function drawDebugHud(ctx, cw, ch) {
    _fpsFrames++;
    const now = performance.now();
    if (now - _fpsLast >= 1000) {
        _fpsDisplay = _fpsFrames;
        _fpsFrames = 0;
        _fpsLast = now;
    }

    ctx.save();
    ctx.globalAlpha = 0.8;

    // --- View switcher (top-center) ---
    const views = getViews();
    const active = getActiveView();
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    const totalWidth = views.length * 100;
    let vx = (cw - totalWidth) / 2 + 50;
    for (const v of views) {
        const isActive = active === v;
        ctx.fillStyle = isActive ? '#5bb8f0' : '#666';
        ctx.fillText(`[${v.keyLabel}] ${v.label}`, vx, 16);
        if (isActive) {
            ctx.fillRect(vx - 40, 20, 80, 1.5);
        }
        vx += 100;
    }
    if (active?.statusText) {
        ctx.fillStyle = '#f90';
        ctx.fillText(active.statusText(), cw / 2, 34);
    }

    // --- Alpha decay (top-right) ---
    ctx.textAlign = 'right';
    ctx.font = '13px monospace';
    const alpha = getAlpha();
    if (alpha > 0) {
        const barW = 80, barH = 6, bx = cw - 12 - barW, by = 14;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = alpha > 0.5 ? '#f90' : alpha > 0.05 ? '#0ff' : '#555';
        ctx.fillRect(bx, by, barW * alpha, barH);
        ctx.fillStyle = '#888';
        ctx.fillText(`\u03B1 ${alpha.toFixed(4)}`, cw - 12, by + barH + 14);
    }

    // --- Scale bar (middle-left) ---
    const scaleBarScreenPx = 100;
    const graphUnitsPerBar = scaleBarScreenPx / state.zoom;
    const bx2 = 16, by2 = ch / 2;
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx2, by2);
    ctx.lineTo(bx2 + scaleBarScreenPx, by2);
    ctx.moveTo(bx2, by2 - 4);
    ctx.lineTo(bx2, by2 + 4);
    ctx.moveTo(bx2 + scaleBarScreenPx, by2 - 4);
    ctx.lineTo(bx2 + scaleBarScreenPx, by2 + 4);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ccc';
    ctx.fillText(`${scaleBarScreenPx}px`, bx2, by2 - 10);
    ctx.fillText(`${graphUnitsPerBar.toFixed(1)} graph`, bx2, by2 + 18);
    ctx.fillText(`zoom: ${state.zoom.toFixed(3)}`, bx2, by2 + 32);

    // --- FPS (bottom-right) ---
    ctx.textAlign = 'right';
    ctx.fillStyle = _fpsDisplay < 30 ? '#e44' : _fpsDisplay < 50 ? '#f90' : '#0f0';
    ctx.fillText(`${_fpsDisplay} fps`, cw - 12, ch - 12);

    // --- Timing breakdown (bottom-right, above FPS) ---
    if (_timingsAvg) {
        ctx.fillStyle = '#ccc';
        ctx.globalAlpha = 0.7;
        let ty = ch - 28;
        for (const [label, ms] of _timingsAvg) {
            ctx.fillText(`${label}: ${ms.toFixed(1)}ms`, cw - 12, ty);
            ty -= 14;
        }
    }

    ctx.restore();
}
