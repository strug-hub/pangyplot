// Pan, drag, zoom (wheel), double-click reset, and window resize.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { scheduleDetailFetch, exitDetailMode } from '../detail-transition-engine.js';
import { scheduleHashUpdate } from '../../engines/navigation/hash-navigation.js';
import { resizeCanvas, fitToScreen } from '../../render/viewport.js';
import { scheduleViewportPublish } from '../../ui/viewport-sync.js';

export function setupPanZoom(canvas) {
    // --- Pan & drag ---
    canvas.addEventListener('mousedown', e => {
        if (state.draggedForceNode || state.hoveredForceNode) return; // handled by node-drag-engine
        if (e.shiftKey && state.detailData) return; // handled by multi-selection
        // Clear selection on non-shift click
        if (state.selectedChains.size > 0 && !state.hoveredChain) {
            state.selectedChains.clear();
            scheduleFrame();
        }
        state.isDragging = true;
        state.dragStartX = e.clientX - state.panX;
        state.dragStartY = e.clientY - state.panY;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', e => {
        if (!state.isDragging || state.draggedForceNode) return;
        state.panX = e.clientX - state.dragStartX;
        state.panY = e.clientY - state.dragStartY;
        scheduleFrame();
        scheduleDetailFetch();
    });

    window.addEventListener('mouseup', () => {
        if (!state.isDragging) return;
        state.isDragging = false;
        canvas.style.cursor = 'grab';
        scheduleHashUpdate();
        scheduleViewportPublish();
    });

    // --- Wheel zoom ---
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05;
        const newZoom = state.zoom * factor;

        state.panX = mx - (mx - state.panX) * (newZoom / state.zoom);
        state.panY = my - (my - state.panY) * (newZoom / state.zoom);
        state.zoom = newZoom;
        scheduleFrame();
        scheduleDetailFetch();
        scheduleHashUpdate();
        scheduleViewportPublish();
    }, { passive: false });

    // --- Resize ---
    window.addEventListener('resize', () => {
        resizeCanvas();
        if (state.stats) scheduleFrame();
    });

    // --- Spacebar: toggle detail <-> skeleton while zoomed in ---
    window.addEventListener('keydown', e => {
        if (e.code !== 'Space' || e.repeat) return;
        if (state.targetGridSize > state.DETAIL_EXIT_THRESHOLD) return;
        e.preventDefault();
        state.detailSuppressed = !state.detailSuppressed;
        if (state.detailSuppressed) {
            exitDetailMode();
        } else {
            scheduleDetailFetch();
        }
    });
}
