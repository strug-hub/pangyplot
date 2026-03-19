// Shift+drag rectangle selection of detail chains, Ctrl+click pop/unpop, Escape clear.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { togglePopChain } from '../../detail/engines/polychain/polychain-pop-engine.js';
import { hitTestChains, chainsInRect } from '../../detail/engines/polychain/polychain-hover-engine.js';
import { hitTestForceNodes } from '../../detail/engines/node-hover-engine.js';
import { popBubbleForceNode } from '../../detail/data/bubble-pop-adapter.js';
import { updateSelectionInfo } from '../../../ui/tabs/information-panel.js';
import { clearSelectionCache } from '../../detail/render/highlight-painter.js';
import { showSelectionPopup, hideSelectionPopup } from './selection-popup.js';
import { showTooltip, hideTooltip } from '../../ui/status-bar.js';

export function setupMultiSelection(canvas) {
    let isSelecting = false;

    // --- Ctrl+click: pop/unpop chain or bubble force node ---
    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
        if (!state.detailData) return;

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const layoutX = (screenX - state.panX) / state.zoom;
        const layoutY = (screenY - state.panY) / state.zoom;

        // Priority: force node bubble pop > chain toggle pop
        if (state.detailOpacity >= 0.5) {
            const hitNode = hitTestForceNodes(layoutX, layoutY);
            if (hitNode && hitNode.type === 'bubble') {
                e.preventDefault();
                e.stopPropagation();
                popBubbleForceNode(hitNode).then(ok => {
                    if (ok) scheduleFrame();
                });
                return;
            }
        }

        const hitChain = hitTestChains(layoutX, layoutY);
        if (hitChain) {
            e.preventDefault();
            e.stopPropagation();
            togglePopChain(hitChain);
            scheduleFrame();
            return;
        }

        // If chains are selected, pop/unpop all of them
        if (state.selectedChains.size > 0) {
            e.preventDefault();
            e.stopPropagation();
            for (const chain of state.selectedChains.keys()) {
                togglePopChain(chain);
            }
            state.selectedChains.clear();
            hideSelectionPopup();
            scheduleFrame();
        }
    });

    // --- Shift key cursor feedback ---
    let zoomNoticeTimer = null;
    window.addEventListener('keydown', e => {
        if (e.key === 'Shift' && !isSelecting) {
            if (state.detailData) {
                canvas.style.cursor = 'crosshair';
            } else {
                const mx = state._lastMouseX ?? window.innerWidth / 2;
                const my = state._lastMouseY ?? window.innerHeight / 2;
                const el = state.dom.tooltip;
                const container = el.offsetParent || el.parentElement;
                const cr = container.getBoundingClientRect();
                el.innerHTML = '<span class="tt-label">zoom in closer to select</span>';
                el.style.display = 'block';
                el.style.left = (mx - cr.left + 8) + 'px';
                el.style.top = (my - cr.top - el.offsetHeight - 4) + 'px';
                clearTimeout(zoomNoticeTimer);
                zoomNoticeTimer = setTimeout(() => hideTooltip(), 1500);
            }
        }
    });
    window.addEventListener('keyup', e => {
        if (e.key === 'Shift' && !isSelecting) {
            clearTimeout(zoomNoticeTimer);
            hideTooltip();
            const hovering = state.hoveredChain || state.hoveredForceNode || state.hoveredBubble || state.hoveredSkeletonPl;
            canvas.style.cursor = hovering ? 'default' : 'grab';
        }
    });

    // --- Shift+drag selection ---
    canvas.addEventListener('mousedown', e => {
        if (!e.shiftKey || !state.detailData) return;
        isSelecting = true;
        hideSelectionPopup();
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        state.selectionBox = { startX: sx, startY: sy, endX: sx, endY: sy };
        canvas.style.cursor = 'crosshair';
    });

    window.addEventListener('mousemove', e => {
        if (!isSelecting) return;
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
        for (const h of hits) state.selectedChains.set(h.chain, { tStart: h.tStart, tEnd: h.tEnd });
        scheduleFrame();
    });

    window.addEventListener('mouseup', e => {
        if (!isSelecting) return;
        isSelecting = false;
        const endScreenX = e.clientX;
        const endScreenY = e.clientY;
        state.selectionBox = null;
        if (state.selectedChains.size > 0) {
            showSelectionPopup(endScreenX, endScreenY);
        } else {
            hideSelectionPopup();
        }
        scheduleFrame();
    });

    // --- Escape key: clear selection ---
    window.addEventListener('keydown', e => {
        if (e.code !== 'Escape') return;
        let changed = false;
        if (state.selectedChains.size > 0 || state.selectionBox) {
            state.selectedChains.clear();
            state.selectionBox = null;
            isSelecting = false;
            hideSelectionPopup();
            changed = true;
        }
        if (state.selectedNode) {
            state.selectedNode = null;
            clearSelectionCache();
            updateSelectionInfo(null);
            changed = true;
        }
        if (changed) scheduleFrame();
    });

}
