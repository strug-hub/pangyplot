// Drag engine for custom annotation label badges.
// Hit-tests cached badge rects from the label renderer; stores
// drag offset in data-space on the annotation object.

import { state } from '../simplify-state.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { getAnnotationLabelBadges } from '../detail/render/polychain/polychain-render-manager.js';

let dragging = null;   // { ann, startMouseX, startMouseY, startOffsetX, startOffsetY }

export function isAnnotationDragging() { return dragging !== null; }
export function isAnnotationBadgeAt(screenX, screenY) { return hitTestBadge(screenX, screenY) !== null; }

function hitTestBadge(screenX, screenY) {
    for (const badge of getAnnotationLabelBadges()) {
        if (screenX >= badge.left && screenX <= badge.left + badge.width &&
            screenY >= badge.top  && screenY <= badge.top + badge.height) {
            return badge.ann;
        }
    }
    return null;
}

export function setupAnnotationLabelDrag(canvas) {
    canvas.addEventListener('mousedown', e => {
        if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
        const ann = hitTestBadge(e.clientX, e.clientY);
        if (!ann) return;
        dragging = {
            ann,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startOffsetX: ann.dragOffset.x,
            startOffsetY: ann.dragOffset.y,
        };
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const dx = (e.clientX - dragging.startMouseX) / state.zoom;
        const dy = (e.clientY - dragging.startMouseY) / state.zoom;
        dragging.ann.dragOffset.x = dragging.startOffsetX + dx;
        dragging.ann.dragOffset.y = dragging.startOffsetY + dy;
        scheduleFrame();
    });

    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = null;
        const hovering = state.hoveredChain || state.hoveredForceNode || state.hoveredBubble;
        canvas.style.cursor = hovering ? 'grab' : 'default';
    });
}
