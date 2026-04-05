// Pan, drag, zoom (wheel), double-click reset, and window resize.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { scheduleDetailFetch, exitDetailMode } from '../detail-transition-engine.js';
import { scheduleHashUpdate } from '../../engines/navigation/hash-navigation.js';
import { resizeCanvas, fitToScreen } from '../../render/viewport.js';
import { scheduleViewportPublish } from '../../ui/viewport-sync.js';
import { pauseForInteraction, resumeAfterInteraction } from '../force-interaction-gate.js';
import { isAnnotationBadgeAt } from '../annotation-label-drag-engine.js';

export function setupPanZoom(canvas) {
    // --- Pan & drag ---
    canvas.addEventListener('mousedown', e => {
        if (isAnnotationBadgeAt(e.clientX, e.clientY)) return;
        if (state.hoveredForceNode) return;
        if (state.hoveredChain && state.detailData) return; // handled by drag-engine
        if (e.shiftKey && state.detailData) return; // handled by multi-selection
        // Clear selection on non-shift click
        if ((state.selectedChains.size > 0 || state.selectedObjects.size > 0) && !state.hoveredChain) {
            state.selectedChains.clear();
            state.selectedObjects.clear();
            scheduleFrame();
        }
        state.isDragging = true;
        state.dragStartX = e.clientX - state.panX;
        state.dragStartY = e.clientY - state.panY;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', e => {
        if (!state.isDragging) return;
        pauseForInteraction();
        state.panX = e.clientX - state.dragStartX;
        state.panY = e.clientY - state.dragStartY;
        scheduleFrame();
        scheduleDetailFetch();
    });

    window.addEventListener('mouseup', () => {
        if (!state.isDragging) return;
        state.isDragging = false;
        resumeAfterInteraction();
        const hovering = state.hoveredChain || state.hoveredForceNode || state.hoveredBubble || state.hoveredSkeletonPl;
        canvas.style.cursor = hovering ? 'default' : 'grab';
        scheduleHashUpdate();
        scheduleViewportPublish();
    });

    // --- Wheel zoom ---
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        pauseForInteraction();
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
        resumeAfterInteraction();  // debounced — resumes 150ms after last wheel event
    }, { passive: false });

    // --- Resize ---
    window.addEventListener('resize', () => {
        resizeCanvas();
        if (state.stats) scheduleFrame();
    });

}
