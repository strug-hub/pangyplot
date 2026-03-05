// Global keyboard shortcuts not owned by a specific engine: L-key physics debug toggle.

import { togglePhysicsDebug } from '../lod/physics-zone.js';
import { scheduleFrame } from '../render/render-manager.js';

export function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
        if (e.code === 'KeyL' && !e.repeat) {
            togglePhysicsDebug();
            scheduleFrame();
        }
    });
}
