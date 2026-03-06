// Global keyboard shortcuts not owned by a specific engine: L-key physics debug toggle.

import { togglePhysicsDebug } from './physics-activation-engine.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';

export function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
        if (e.code === 'KeyL' && !e.repeat) {
            togglePhysicsDebug();
            scheduleFrame();
        }
    });
}
