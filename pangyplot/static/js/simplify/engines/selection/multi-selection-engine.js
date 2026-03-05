// Shift+drag rectangle selection of detail chains, X-key pop/unpop, Escape clear.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../render/render-manager.js';
import { togglePopChain } from '../../engines/bubble-pop/chain-pop-engine.js';
import { chainsInRect } from '../../utils/hit-test.js';

export function setupMultiSelection(canvas) {
    let isSelecting = false;

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

    // --- C key: toggle chain overlay ---
    window.addEventListener('keydown', e => {
        if (e.code === 'KeyC' && !e.repeat) {
            state.hideChainOverlay = !state.hideChainOverlay;
            scheduleFrame();
        }
    });
}
