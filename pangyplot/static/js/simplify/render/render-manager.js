// Main canvas rendering: draw loop, RAF scheduling, detail bar DOM update.

import { state } from '../simplify-state.js';
import { selectLevel, updateGridMeter } from '../lod/lod.js';
import { getViewport, viewportStepCount } from '../render/viewport.js';
import { formatBp } from '../utils/format-utils.js';
import { xToBp, getChromosome } from '../data/spine.js';
import { isPhysicsDebugActive, drawPhysicsDebugOverlay, drawPhysicsDebugHUD } from '../lod/physics-zone.js';
import { drawSkeleton } from './painter/skeleton-painter.js';
import { drawDetail } from './painter/detail-painter.js';
import { drawGeneLabels } from './annotation/gene-label-renderer.js';

let rafId = null;

// ---------------------------------------------------------------
// Detail bar DOM update (lives here to avoid render<->detail cycle)
// ---------------------------------------------------------------
export function updateDetailBar() {
    if (!state.detailData) return;
    state.dom.detailChains.textContent = state.detailData.chains.length.toLocaleString();
    state.dom.detailExposed.textContent = '0';
    state.dom.detailNodes.textContent = (state.detailData.totalBubbles || 0).toLocaleString();
    if (state.detailData.bpStart != null) {
        state.dom.detailRange.textContent = `${formatBp(state.detailData.bpStart)}-${formatBp(state.detailData.bpEnd)}`;
    }
    state.dom.detailOpacity.textContent = state.detailOpacity.toFixed(2);
    const steps = viewportStepCount();
    state.dom.detailSteps.textContent = isFinite(steps) ? Math.round(steps).toLocaleString() : '--';
}

// ---------------------------------------------------------------
// Main draw
// ---------------------------------------------------------------
export function draw() {
    const ctx = state.ctx;
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    const li = selectLevel();
    const level = state.data.levels[li];
    if (!level) return;

    const levelChanged = li !== state.currentLevel;
    updateGridMeter(li);

    // Update zoom readout
    state.dom.zoomVal.textContent = state.zoom < 1
        ? state.zoom.toFixed(4) : state.zoom.toFixed(1);

    // Update detail bar readouts (steps change with pan/zoom)
    if (state.detailPhase !== 'none') updateDetailBar();

    const vp = getViewport();
    // Margin in data units so lines at the edge aren't clipped
    const margin = (level.cellSize || 50) * 2;
    const vpMinX = vp.minX - margin;
    const vpMinY = vp.minY - margin;
    const vpMaxX = vp.maxX + margin;
    const vpMaxY = vp.maxY + margin;

    // ===== DATA-SPACE TRANSFORM =====
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    // ===== SKELETON LAYER (skipped when detail is fully active) =====
    const skipSkeleton = state.detailData && state.detailPhase === 'static';
    let visiblePl = 0;
    let visibleJ = 0;

    if (!skipSkeleton) {
        const counts = drawSkeleton(ctx, level, li, vpMinX, vpMinY, vpMaxX, vpMaxY);
        visiblePl = counts.visiblePl;
        visibleJ = counts.visibleJ;
    }

    // ===== DETAIL LAYER (drawn in same data-space transform) =====
    if (state.detailData && state.detailOpacity > 0) {
        drawDetail();
    }

    // ===== PHYSICS DEBUG OVERLAY (data-space) =====
    if (isPhysicsDebugActive() && state.detailData) {
        drawPhysicsDebugOverlay(ctx, vp);
    }

    ctx.restore();

    // ===== PHYSICS DEBUG HUD (screen-space) =====
    if (isPhysicsDebugActive() && state.detailData) {
        drawPhysicsDebugHUD(ctx, cw);
    }

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

    // --- Gene labels (screen coords) ---
    drawGeneLabels(ctx, cw);

    // --- Update info ---
    if (levelChanged) {
        state.dom.levelLabel.textContent = level.label;
        state.dom.nodeCount.textContent = level.nodeCount.toLocaleString();
        state.dom.polylineCount.textContent = level.polylineCount.toLocaleString();
        const pct = ((1 - level.nodeCount / state.data.stats.totalSegments) * 100).toFixed(1);
        state.dom.reduction.textContent = `${pct}%`;
    }
    state.dom.visibleCount.textContent = `${visiblePl.toLocaleString()} / ${visibleJ.toLocaleString()}`;

    // --- Viewport coordinate readout ---
    const chr = getChromosome();
    if (chr) {
        const bpLeft = xToBp(vp.minX);
        const bpRight = xToBp(vp.maxX);
        if (bpLeft !== null && bpRight !== null) {
            state.dom.viewportBp.textContent = `${chr}:${formatBp(bpLeft)}-${formatBp(bpRight)}`;
        }
    }
}

// ---------------------------------------------------------------
// RAF-throttled frame scheduling
// ---------------------------------------------------------------
export function scheduleFrame() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        draw();
    });
}
