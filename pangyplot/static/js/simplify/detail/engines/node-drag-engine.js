// Drag engine for force-graph nodes in the simplify viewer.
// Follows the core viewer's drag-engine pattern: pointerdown → threshold → drag with fx/fy → release.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { reheatSimulation } from './force-engine.js';
import { hideTooltip } from '../../ui/status-bar.js';

const MIN_MOVEMENT_PX = 5;

let readyNode = null;
let initialX = 0;
let initialY = 0;
let savedFx = undefined;
let savedFy = undefined;

export function setupNodeDrag(canvas) {
    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return; // let pop / multi-select handle these
        if (!state.hoveredForceNode) return;

        readyNode = state.hoveredForceNode;
        initialX = e.clientX;
        initialY = e.clientY;
        // Save current pin state so we can restore anchors on release
        savedFx = readyNode.fx;
        savedFy = readyNode.fy;
    });

    window.addEventListener('pointermove', e => {
        if (!readyNode && !state.draggedForceNode) return;

        const dx = e.clientX - initialX;
        const dy = e.clientY - initialY;

        // Still in threshold detection phase
        if (readyNode && !state.draggedForceNode) {
            if (Math.sqrt(dx * dx + dy * dy) < MIN_MOVEMENT_PX) return;
            // Commit to drag
            state.draggedForceNode = readyNode;
            readyNode = null;
            canvas.style.cursor = 'grabbing';
            hideTooltip();
        }

        // Active drag — convert screen coords to layout coords
        const node = state.draggedForceNode;
        if (!node) return;

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const layoutX = (screenX - state.panX) / state.zoom;
        const layoutY = (screenY - state.panY) / state.zoom;

        node.x = layoutX;
        node.y = layoutY;
        node.fx = layoutX;
        node.fy = layoutY;

        reheatSimulation();
        scheduleFrame();
    });

    window.addEventListener('pointerup', () => {
        if (readyNode) {
            readyNode = null;
            return;
        }

        const node = state.draggedForceNode;
        if (!node) return;

        // Restore original pin state: anchors get their home pin back, free nodes stay free
        if (node.isAnchor && savedFx != null) {
            node.fx = savedFx;
            node.fy = savedFy;
        } else {
            delete node.fx;
            delete node.fy;
        }

        state.draggedForceNode = null;
        savedFx = undefined;
        savedFy = undefined;
        canvas.style.cursor = state.hoveredForceNode ? 'crosshair' : 'grab';
        reheatSimulation();
        scheduleFrame();
    });
}
