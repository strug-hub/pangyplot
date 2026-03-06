// Shift+drag rectangle selection of detail chains, Ctrl+click pop/unpop, Escape clear.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../render-manager.js';
import { togglePopChain } from '../../force/engines/chain-pop-engine.js';
import { chainsInRect, hitTestForceNodes, hitTestChains } from '../../utils/hit-test.js';
import { popBubbleForceNode } from '../../force/data/bubble-pop-adapter.js';

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
            for (const chain of state.selectedChains) {
                togglePopChain(chain);
            }
            state.selectedChains.clear();
            scheduleFrame();
        }
    });

    // --- Shift+drag selection ---
    canvas.addEventListener('mousedown', e => {
        if (!e.shiftKey || !state.detailData) return;
        isSelecting = true;
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
        for (const c of hits) state.selectedChains.add(c);
        scheduleFrame();
    });

    window.addEventListener('mouseup', () => {
        if (!isSelecting) return;
        isSelecting = false;
        state.selectionBox = null;
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

    // --- C key: toggle chain overlay ---
    window.addEventListener('keydown', e => {
        if (e.code === 'KeyC' && !e.repeat) {
            state.hideChainOverlay = !state.hideChainOverlay;
            scheduleFrame();
        }
    });
}
