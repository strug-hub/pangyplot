// Mouse/wheel handlers, pan/drag, zoom, dblclick, resize.

import { state } from './simplify-state.js';
import { scheduleFrame } from './render.js';
import { scheduleDetailFetch, exitDetailMode } from './detail.js';
import { scheduleHashUpdate } from './hash-navigation.js';
import { resizeCanvas, fitToScreen } from './viewport.js';
import { xToBp, getChromosome, isReady } from './spine.js';
import { formatBp } from './format-utils.js';
import { hitTestForceNodes, hitTestBubbles, hitTestChains, hitTestSkeleton, formatForceNodeTooltip, formatTooltip, formatBubbleTooltip, formatSkeletonTooltip } from './hit-test.js';

export function setupInteraction() {
    const canvas = state.canvas;
    const tooltipEl = state.dom.tooltip;
    const cursorBpEl = state.dom.cursorBp;

    // --- Pan & drag ---
    canvas.addEventListener('mousedown', e => {
        state.isDragging = true;
        state.dragStartX = e.clientX - state.panX;
        state.dragStartY = e.clientY - state.panY;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', e => {
        if (!state.isDragging) return;
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
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newZoom = state.zoom * factor;

        state.panX = mx - (mx - state.panX) * (newZoom / state.zoom);
        state.panY = my - (my - state.panY) * (newZoom / state.zoom);
        state.zoom = newZoom;
        scheduleFrame();
        scheduleDetailFetch();
        scheduleHashUpdate();
    }, { passive: false });

    // --- Cursor coordinate readout + hover hit-test ---
    canvas.addEventListener('mousemove', e => {
        if (state.isDragging || !isReady()) return;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const layoutX = (screenX - state.panX) / state.zoom;
        const layoutY = (screenY - state.panY) / state.zoom;
        const bp = xToBp(layoutX);
        const chr = getChromosome();
        if (bp !== null && chr) {
            cursorBpEl.textContent = `${chr}:${formatBp(bp)}`;
        }

        // Hit-test priority: force nodes > bubbles > chains > skeleton polylines
        const hitForceNode = hitTestForceNodes(layoutX, layoutY);
        const hitBubble = hitForceNode ? null : hitTestBubbles(layoutX, layoutY);
        const hitChain = (hitForceNode || hitBubble) ? null : hitTestChains(layoutX, layoutY);
        const hitSkel = (hitForceNode || hitBubble || hitChain) ? null : hitTestSkeleton(layoutX, layoutY);
        const hit = hitForceNode || hitBubble || hitChain || hitSkel;

        if (hit) {
            state.hoveredForceNode = hitForceNode;
            state.hoveredBubble = hitBubble;
            state.hoveredChain = hitChain;
            state.hoveredSkeletonPl = hitSkel;
            if (hitForceNode) {
                tooltipEl.innerHTML = formatForceNodeTooltip(hitForceNode);
            } else if (hitBubble) {
                tooltipEl.innerHTML = formatBubbleTooltip(hitBubble);
            } else if (hitChain) {
                tooltipEl.innerHTML = formatTooltip(hitChain);
            } else {
                tooltipEl.innerHTML = formatSkeletonTooltip(hitSkel);
            }
            tooltipEl.style.display = 'block';
            // Position tooltip near cursor, offset right and up
            const ttRect = tooltipEl.getBoundingClientRect();
            let tx = e.clientX + 14;
            let ty = e.clientY - ttRect.height - 8;
            // Keep on screen
            if (tx + ttRect.width > window.innerWidth - 8) tx = e.clientX - ttRect.width - 14;
            if (ty < 4) ty = e.clientY + 18;
            tooltipEl.style.left = tx + 'px';
            tooltipEl.style.top = ty + 'px';
            canvas.style.cursor = 'crosshair';
            scheduleFrame();
        } else if (state.hoveredChain || state.hoveredBubble || state.hoveredForceNode || state.hoveredSkeletonPl) {
            state.hoveredChain = null;
            state.hoveredBubble = null;
            state.hoveredForceNode = null;
            state.hoveredSkeletonPl = null;
            tooltipEl.style.display = 'none';
            canvas.style.cursor = 'grab';
            scheduleFrame();
        }
    });

    canvas.addEventListener('mouseleave', () => {
        cursorBpEl.textContent = '';
        if (state.hoveredChain || state.hoveredBubble || state.hoveredForceNode || state.hoveredSkeletonPl) {
            state.hoveredChain = null;
            state.hoveredBubble = null;
            state.hoveredForceNode = null;
            state.hoveredSkeletonPl = null;
            tooltipEl.style.display = 'none';
            canvas.style.cursor = 'grab';
            scheduleFrame();
        }
    });

    // --- Spacebar: toggle detail ↔ skeleton while zoomed in ---
    window.addEventListener('keydown', e => {
        if (e.code !== 'Space' || e.repeat) return;
        // Only toggle when zoomed in enough for detail mode
        if (state.targetCell > state.DETAIL_CELL_THRESHOLD) return;
        e.preventDefault();
        state.detailSuppressed = !state.detailSuppressed;
        if (state.detailSuppressed) {
            exitDetailMode();
        } else {
            scheduleDetailFetch();
        }
    });

    // --- Double-click to reset view ---
    canvas.addEventListener('dblclick', () => {
        fitToScreen();
        scheduleFrame();
        scheduleDetailFetch();
        scheduleHashUpdate();
    });

    // --- Resize ---
    window.addEventListener('resize', () => {
        resizeCanvas();
        if (state.data) scheduleFrame();
    });
}
