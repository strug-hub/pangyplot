// "Anchor on drag" toggle for the viewer.
// 'F' keyboard shortcut toggles the state and syncs the UI toggle.

import { state } from '../../state.js';

export function setupDragFixEngine(canvas) {
    canvas.addEventListener('keydown', e => {
        if (e.code === 'KeyF' && !e.repeat) {
            state.fixOnDrag = !state.fixOnDrag;
            window.__anchorToggle?.setOn?.(state.fixOnDrag);
        }
    });
}
