// Main canvas rendering: draw loop, RAF scheduling.

import { state } from './simplify-state.js';
import { getViewport } from './render/viewport.js';
import { isPhysicsDebugActive, drawPhysicsDebugOverlay, drawPhysicsDebugHUD } from './physics-zone.js';
import { drawSkeleton } from './skeleton/render/skeleton-render-manager.js';
import { drawDetail } from './detail/render/detail-painter.js';
import { drawGeneLabelOverlay } from './skeleton/render/skeleton-gene-overlay.js';
import { updateZoom, updateSkeletonLevel, updateVisibleCounts, updateViewportBp, updateDetailBar } from './ui/status-bar.js';
import { updateLOD } from './engines/lod-engine.js';
import { getLevel } from './skeleton/data/skeleton-data.js';

let rafId = null;

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

    updateLOD();
    const level = getLevel();
    if (!level) return;

    updateSkeletonLevel(level, state.currentLOD);
    updateZoom();

    // Update detail bar readouts (steps change with pan/zoom)
    if (state.detailPhase !== 'none') updateDetailBar();

    const vp = getViewport();
    // Margin in data units so lines at the edge aren't clipped
    const margin = (level.gridSize || 50) * 2;
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
        const counts = drawSkeleton(ctx, level, vpMinX, vpMinY, vpMaxX, vpMaxY);
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
    drawGeneLabelOverlay(ctx, cw);

    // --- Status bar ---
    updateVisibleCounts(visiblePl, visibleJ);
    updateViewportBp(vp);
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
