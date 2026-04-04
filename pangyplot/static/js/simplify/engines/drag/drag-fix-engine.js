// "Anchor on drag" toggle for the simplify viewer.
// Binds to the shared #anchorToggle checkbox and 'F' keyboard shortcut.

import { state } from '../../simplify-state.js';

export function setupDragFixEngine(canvas) {
    const checkbox = document.getElementById('anchorToggle');
    if (!checkbox) return;

    checkbox.checked = state.fixOnDrag;
    checkbox.addEventListener('change', e => {
        state.fixOnDrag = e.target.checked;
    });

    canvas.addEventListener('keydown', e => {
        if (e.code === 'KeyF' && !e.repeat) {
            checkbox.checked = !checkbox.checked;
            state.fixOnDrag = checkbox.checked;
        }
    });
}
