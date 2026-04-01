// Main canvas rendering: draw loop.

import { state } from './simplify-state.js';
import { colorState } from '../graph/render/color/color-state.js';
import { setDrawCallback, scheduleFrame } from './utils/frame-scheduler.js';
import { updateLegend } from '../graph/render/color/legend/legend-manager.js';
import eventBus from '@event-bus';
import { getViewport } from './render/viewport.js';
import { isDebugMode } from '@app-state';
import { drawSkeleton } from './skeleton/render/skeleton-render-manager.js';
import { drawDetail, drawCustomAnnotationLabels } from './detail/render/polychain/polychain-render-manager.js';
import { drawForceGraph } from './detail/render/force-render-manager.js';
import { getAlpha } from './detail/engines/force-engine.js';
import { drawGeneLabelOverlay } from './skeleton/render/gene-label-overlay.js';
import { updateZoom, updateSkeletonLevel, updateVisibleCounts, updateViewportBp, updateDetailBar, updateFetchIndicator } from './ui/status-bar.js';
import { updateLOD } from './engines/lod-engine.js';
import { getLevelMeta } from '@simplify-data/chromosome-data.js';
// import { renderDragInfluenceCircle } from './engines/drag/drag-influence-render.js';

// ---------------------------------------------------------------
// FPS tracker (debug mode only)
// ---------------------------------------------------------------
let _fpsFrames = 0;
let _fpsLast = performance.now();
let _fpsDisplay = 0;
let _timingsHistory = [];  // ring buffer of last 5 frames
let _timingsAvg = null;

// ---------------------------------------------------------------
// Main draw
// ---------------------------------------------------------------
function draw() {
    const ctx = state.ctx;
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;

    const _debug = isDebugMode();

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = colorState.background;
    ctx.fillRect(0, 0, cw, ch);

    updateLOD();
    const meta = getLevelMeta();
    if (!meta) return;

    updateSkeletonLevel(state.currentLOD);
    updateZoom();

    // Update detail bar readouts (steps change with pan/zoom)
    if (state.detailPhase !== 'none') updateDetailBar();

    const vp = getViewport();
    // Margin in data units so lines at the edge aren't clipped
    const margin = (meta.gridSize || 50) * 2;
    const vpMinX = vp.minX - margin;
    const vpMinY = vp.minY - margin;
    const vpMaxX = vp.maxX + margin;
    const vpMaxY = vp.maxY + margin;

    // ===== DATA-SPACE TRANSFORM =====
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    let _t0;
    const timings = [];

    // ===== SKELETON LAYER (skipped when detail is fully active) =====
    const skipSkeleton = state.detailData && state.detailPhase === 'static';
    let visiblePl = 0;

    if (!skipSkeleton) {
        if (_debug) _t0 = performance.now();
        const counts = drawSkeleton(ctx, vpMinX, vpMinY, vpMaxX, vpMaxY);
        if (_debug) timings.push(['skeleton', performance.now() - _t0]);
        visiblePl = counts.visiblePl;
    }

    // ===== DETAIL LAYER (drawn in same data-space transform) =====
    if (state.detailData && state.detailOpacity > 0) {
        if (_debug) _t0 = performance.now();
        drawDetail();
        drawForceGraph(state.ctx, Math.max(1.5, 3 / state.zoom), null, { minX: vpMinX, minY: vpMinY, maxX: vpMaxX, maxY: vpMaxY });
        if (_debug) timings.push(['detail', performance.now() - _t0]);
    }

    ctx.restore();

    // --- Selection rectangle (screen coords) ---
    if (state.selectionBox) {
        const box = state.selectionBox;
        const sx = Math.min(box.startX, box.endX);
        const sy = Math.min(box.startY, box.endY);
        const sw = Math.abs(box.endX - box.startX);
        const sh = Math.abs(box.endY - box.startY);
        ctx.fillStyle = 'rgba(91, 184, 240, 0.08)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = 'rgba(91, 184, 240, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
    }

    // --- Custom annotation labels (screen coords) ---
    drawCustomAnnotationLabels(ctx);

    // --- Gene labels (screen coords) ---
    if (_debug) _t0 = performance.now();
    drawGeneLabelOverlay(ctx, cw);
    if (_debug) timings.push(['labels', performance.now() - _t0]);

    if (_debug) {
        _timingsHistory.push(timings);
        if (_timingsHistory.length > 5) _timingsHistory.shift();
        // Average across recent frames
        const avg = new Map();
        for (const frame of _timingsHistory) {
            for (const [label, ms] of frame) {
                avg.set(label, (avg.get(label) || 0) + ms);
            }
        }
        const n = _timingsHistory.length;
        _timingsAvg = [...avg.entries()].map(([label, total]) => [label, total / n]);
    }

    // --- FPS counter + timing breakdown (debug mode) ---
    if (isDebugMode()) {
        _fpsFrames++;
        const now = performance.now();
        if (now - _fpsLast >= 1000) {
            _fpsDisplay = _fpsFrames;
            _fpsFrames = 0;
            _fpsLast = now;
        }
        ctx.save();
        ctx.font = '13px monospace';
        ctx.textAlign = 'right';
        ctx.globalAlpha = 0.8;

        // Alpha decay (top-right)
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

        // Scale bar (middle-left)
        const scaleBarScreenPx = 100;
        const graphUnitsPerBar = scaleBarScreenPx / state.zoom;
        const bx2 = 16, by2 = ch / 2;
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx2, by2);
        ctx.lineTo(bx2 + scaleBarScreenPx, by2);
        // End ticks
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
        ctx.textAlign = 'right';

        // FPS (bottom-right)
        ctx.fillStyle = _fpsDisplay < 30 ? '#e44' : _fpsDisplay < 50 ? '#f90' : '#0f0';
        ctx.fillText(`${_fpsDisplay} fps`, cw - 12, ch - 12);
        // Show timing breakdown (averaged over last 5 frames)
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

    // --- Status bar ---
    updateVisibleCounts(visiblePl);
    updateViewportBp(vp);
    updateFetchIndicator();

    // Hide color legend in skeleton-only mode (no detail data)
    const legend = document.getElementById('graph-legend');
    if (legend) legend.style.display = state.detailData ? 'block' : 'none';
}

setDrawCallback(draw);
updateLegend();

// Redraw when color state changes (style, presets, individual pickers)
eventBus.subscribe('color:updated', () => scheduleFrame());
