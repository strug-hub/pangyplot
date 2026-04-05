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
import { getBaseWidth } from './detail/engines/forces/pc-settings.js';
import { drawGeneLabelOverlay } from './skeleton/render/gene-label-overlay.js';
import { updateZoom, updateSkeletonLevel, updateVisibleCounts, updateViewportBp, updateDetailBar, updateFetchIndicator } from './ui/status-bar.js';
import { updateLOD } from './engines/lod-engine.js';
import { getLevelMeta } from '@simplify-data/chromosome-data.js';
import { getSearchHighlights } from './engines/node-search-engine.js';
import { strokeRing } from './detail/render/detail-painter.js';
import { getActiveView } from '@debug/debug-orchestrator.js';
import { drawDebugHud, recordTimings } from '@debug/debug-hud.js';
// Register debug views (side-effect imports)
import '@debug/views/force-vectors.js';
import '@debug/views/hit-zones.js';

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

    let _t0;
    const timings = [];

    // ===== DATA-SPACE TRANSFORM =====
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    // ===== SKELETON LAYER (skipped when detail is fully active) =====
    const skipSkeleton = !state.alwaysShowSkeleton && state.detailData && state.detailPhase === 'static';
    let visiblePl = 0;

    if (!skipSkeleton) {
        if (_debug) _t0 = performance.now();
        const counts = drawSkeleton(ctx, vpMinX, vpMinY, vpMaxX, vpMaxY);
        if (_debug) timings.push(['skeleton', performance.now() - _t0]);
        visiblePl = counts.visiblePl;
    }

    // ===== DETAIL LAYER (suppressed when skeleton-always mode is on) =====
    if (!state.alwaysShowSkeleton && state.detailData && state.detailOpacity > 0) {
        if (_debug) _t0 = performance.now();
        drawDetail();
        drawForceGraph(state.ctx, getBaseWidth(), null, { minX: vpMinX, minY: vpMinY, maxX: vpMaxX, maxY: vpMaxY });
        if (_debug) timings.push(['detail', performance.now() - _t0]);
    }

    // --- Active debug view overlay (data-space) ---
    const activeDebugView = _debug ? getActiveView() : null;
    if (activeDebugView) activeDebugView.draw(ctx);

    // --- Search highlight rings (data-space) ---
    const searchHits = getSearchHighlights();
    if (searchHits.length > 0) {
        const lw = Math.max(2 / state.zoom, 0.5);
        for (const hit of searchHits) {
            const r = Math.max(15 / state.zoom, hit.radius + 5 / state.zoom);
            strokeRing(ctx, hit.x, hit.y, r, '#FF9800', lw, 0.85);
        }
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

    // --- Debug HUD (screen coords) ---
    if (_debug) {
        recordTimings(timings);
        drawDebugHud(ctx, cw, ch);
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
