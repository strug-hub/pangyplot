// Mouse/wheel handlers, pan/drag, zoom, dblclick, resize.

import { state } from './simplify-state.js';
import { scheduleFrame } from './render.js';
import { scheduleDetailFetch, exitDetailMode, togglePopChain } from './detail.js';
import { togglePhysicsDebug } from './physics-zone.js';
import { scheduleHashUpdate } from './hash-navigation.js';
import { resizeCanvas, fitToScreen } from './viewport.js';
import { xToBp, getChromosome, isReady } from './spine.js';
import { formatBp } from './format-utils.js';
import { hitTestForceNodes, hitTestBubbles, hitTestChains, hitTestSkeleton, chainsInRect, formatForceNodeTooltip, formatTooltip, formatBubbleTooltip, formatSkeletonTooltip } from './hit-test.js';

export function setupInteraction() {
    const canvas = state.canvas;
    const tooltipEl = state.dom.tooltip;
    const cursorBpEl = state.dom.cursorBp;

    let isSelecting = false;

    // --- Pan & drag / Shift+drag selection ---
    canvas.addEventListener('mousedown', e => {
        if (e.shiftKey && state.detailData) {
            // Start rectangle selection
            isSelecting = true;
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            state.selectionBox = { startX: sx, startY: sy, endX: sx, endY: sy };
            canvas.style.cursor = 'crosshair';
            return;
        }
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
        if (isSelecting) {
            const rect = canvas.getBoundingClientRect();
            state.selectionBox.endX = e.clientX - rect.left;
            state.selectionBox.endY = e.clientY - rect.top;
            // Convert screen box to data coords
            const box = state.selectionBox;
            const sMinX = Math.min(box.startX, box.endX);
            const sMaxX = Math.max(box.startX, box.endX);
            const sMinY = Math.min(box.startY, box.endY);
            const sMaxY = Math.max(box.startY, box.endY);
            const dMinX = (sMinX - state.panX) / state.zoom;
            const dMaxX = (sMaxX - state.panX) / state.zoom;
            const dMinY = (sMinY - state.panY) / state.zoom;
            const dMaxY = (sMaxY - state.panY) / state.zoom;
            const hits = chainsInRect(dMinX, dMinY, dMaxX, dMaxY);
            state.selectedChains.clear();
            for (const c of hits) state.selectedChains.add(c);
            scheduleFrame();
            return;
        }
        if (!state.isDragging) return;
        state.panX = e.clientX - state.dragStartX;
        state.panY = e.clientY - state.dragStartY;
        scheduleFrame();
        scheduleDetailFetch();
    });

    window.addEventListener('mouseup', () => {
        if (isSelecting) {
            isSelecting = false;
            state.selectionBox = null;
            scheduleFrame();
            return;
        }
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
        if (state.isDragging || isSelecting || !isReady()) return;
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

    // --- L key: toggle physics zone debug overlay ---
    window.addEventListener('keydown', e => {
        if (e.code === 'KeyL' && !e.repeat) {
            togglePhysicsDebug();
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

    // --- X key: pop/unpop selected chains or hovered chain ---
    window.addEventListener('keydown', e => {
        if (e.code !== 'KeyX' || e.repeat) return;
        if (!state.detailData) return;
        if (state.selectedChains.size > 0) {
            for (const chain of state.selectedChains) {
                togglePopChain(chain);
            }
            state.selectedChains.clear();
            scheduleFrame();
            return;
        }
        const chain = state.hoveredChain;
        if (!chain) return;
        togglePopChain(chain);
        scheduleFrame();
    });

    // --- Escape key: clear selection ---
    window.addEventListener('keydown', e => {
        if (e.code !== 'Escape') return;
        if (state.selectedChains.size > 0 || state.selectionBox) {
            state.selectedChains.clear();
            state.selectionBox = null;
            isSelecting = false;
            scheduleFrame();
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
