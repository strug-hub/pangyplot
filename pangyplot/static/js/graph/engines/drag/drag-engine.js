// Drag orchestrator for the viewer.
// Supports node drag (force nodes from popped bubbles) and chain drag
// (move all polychain nodes as a rigid body).

import { state } from '../../state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { reheatDrag } from '../../detail/engines/force-engine.js';
import { getContainer } from '../../detail/model/model-manager.js';
import { setupDragFixEngine } from './drag-fix-engine.js';
import { anchorChain } from './centroid-anchor-force.js';
import { setupDragLockBadge, showDragLock, hideDragLock } from './drag-lock-render.js';
import { hideTooltip } from '@ui/elements/tooltip.js';
import { resetDragInfluence } from './drag-influence-force.js';

const MIN_MOVEMENT_PX = 5;

let readyMode = null;   // 'node' | 'chain' — set on pointerdown, cleared on drag start or cancel
let readyTarget = null;  // the hovered element when pointerdown fired
let initialMousePos = { x: 0, y: 0 };

// ---------------------------------------------------------------
// Screen → data-space conversion
// ---------------------------------------------------------------

function screenToData(screenX, screenY) {
    const rect = state.canvas.getBoundingClientRect();
    return {
        x: (screenX - rect.left - state.panX) / state.zoom,
        y: (screenY - rect.top  - state.panY) / state.zoom,
    };
}

// ---------------------------------------------------------------
// Drag start (activate after movement threshold)
// ---------------------------------------------------------------

function activateDrag(e) {
    const dx = e.clientX - initialMousePos.x;
    const dy = e.clientY - initialMousePos.y;
    if (dx * dx + dy * dy < MIN_MOVEMENT_PX * MIN_MOVEMENT_PX) return false;

    const mode = readyMode;
    const target = readyTarget;
    readyMode = null;
    readyTarget = null;

    state.dragMode = mode;
    state.dragTarget = target;
    state.canvas.style.cursor = 'grabbing';

    // Reset influence tracking so stale prevPos from a previous drag
    // (which may not have been cleared if the sim cooled and stopped
    // before endDrag ran) can't produce a huge first-tick delta.
    resetDragInfluence();

    const data = screenToData(e.clientX, e.clientY);
    state.dragPrevDataX = data.x;
    state.dragPrevDataY = data.y;

    if (mode === 'node') {
        target.fx = target.x;
        target.fy = target.y;
    } else if (mode === 'chain') {
        const nodes = getContainer(target.id)?.spineNodes;
        state.dragChainNodes = nodes;
        if (nodes) {
            for (const n of nodes) {
                n.fx = n.x;
                n.fy = n.y;
            }
        }
    }

    hideTooltip();
    showDragLock();
    reheatDrag();
    scheduleFrame();
    return true;
}

// ---------------------------------------------------------------
// Drag move
// ---------------------------------------------------------------

function updateDrag(e) {
    const data = screenToData(e.clientX, e.clientY);
    const mode = state.dragMode;

    if (mode === 'node') {
        const node = state.dragTarget;
        node.x = data.x;
        node.y = data.y;
        node.fx = data.x;
        node.fy = data.y;
    } else if (mode === 'chain') {
        const dx = data.x - state.dragPrevDataX;
        const dy = data.y - state.dragPrevDataY;
        const nodes = state.dragChainNodes;
        if (nodes) {
            for (const n of nodes) {
                n.x  += dx;
                n.y  += dy;
                n.fx += dx;
                n.fy += dy;
            }
        }
    }

    state.dragPrevDataX = data.x;
    state.dragPrevDataY = data.y;
    reheatDrag();
    scheduleFrame();
}

// ---------------------------------------------------------------
// Drag end
// ---------------------------------------------------------------

function endDrag() {
    const mode = state.dragMode;
    const target = state.dragTarget;

    if (mode === 'node') {
        if (state.fixOnDrag) {
            target.fx = target.x;
            target.fy = target.y;
        } else {
            target.fx = undefined;
            target.fy = undefined;
        }
    } else if (mode === 'chain') {
        const nodes = state.dragChainNodes;
        if (nodes) {
            // Unfix all nodes but let viewportFreezeForce re-pin offscreen
            // ones immediately. Reset _vpFrozen so they get re-evaluated.
            for (const n of nodes) {
                n._vpFrozen = false;
                n.fx = undefined;
                n.fy = undefined;
            }
            anchorChain(target.id, nodes, state.fixOnDrag);
        }
    }

    hideDragLock();

    const hovering = state.hoveredChain || state.hoveredForceNode || state.hoveredBubble;
    state.canvas.style.cursor = hovering ? 'grab' : 'default';

    state.dragMode = null;
    state.dragTarget = null;
    state.dragChainNodes = null;
    scheduleFrame();
}

// ---------------------------------------------------------------
// Setup
// ---------------------------------------------------------------

export function setupDragEngine(canvas) {
    setupDragFixEngine(canvas);
    setupDragLockBadge(canvas);

    // --- Pointer down: detect drag-ready target ---
    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (e.shiftKey || e.ctrlKey || e.metaKey) return;

        if (state.hoveredForceNode && !state.hoveredForceNode.isPolychainNode) {
            readyMode = 'node';
            readyTarget = state.hoveredForceNode;
        } else if (state.hoveredChain && state.detailData) {
            readyMode = 'chain';
            readyTarget = state.hoveredChain;
        } else {
            return;
        }
        initialMousePos = { x: e.clientX, y: e.clientY };
    });

    // --- Pointer move: threshold check then continuous drag ---
    window.addEventListener('pointermove', e => {
        if (readyMode) {
            activateDrag(e);
        } else if (state.dragMode) {
            updateDrag(e);
        }
    });

    // --- Pointer up: end drag or cancel ready ---
    window.addEventListener('pointerup', () => {
        readyMode = null;
        readyTarget = null;
        if (state.dragMode) {
            endDrag();
        }
    });
}
