// Floating lock badge next to the cursor during drag when fixOnDrag is active.

import { state } from '../../state.js';
import { createCursorBadge } from '../../ui/cursor-badge.js';

let badge = null;

export function setupDragLockBadge(canvas) {
    badge = createCursorBadge('fa-solid fa-lock');

    canvas.addEventListener('mousemove', e => {
        badge.move(e.clientX, e.clientY);
    });

    canvas.addEventListener('mouseleave', () => badge.hide());
}

export function showDragLock() {
    if (badge && state.fixOnDrag) badge.show();
}

export function hideDragLock() {
    if (badge) badge.hide();
}
