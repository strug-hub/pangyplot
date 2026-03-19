// Global keyboard shortcuts not owned by a specific engine.

import { state } from '../simplify-state.js';
import { togglePhysicsDebug } from './physics-activation-engine.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { unpopLastBubble } from '../detail/data/bubble-unpop-adapter.js';
import { returnToSimplify } from './selection/selection-popup.js';

export function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
        // Escape from core viewer → return to simplify canvas
        if (e.code === 'Escape' && state.coreViewerActive) {
            returnToSimplify();
            scheduleFrame();
            return;
        }
        if (e.code === 'KeyL' && !e.repeat) {
            togglePhysicsDebug();
            scheduleFrame();
        }
        if (e.code === 'KeyY' && !e.repeat) {
            state.forceVectors = !state.forceVectors;
            state.forceVectorMode = 'all';
            scheduleFrame();
        }
        if (e.code === 'KeyU' && !e.repeat) {
            const modes = ['all', 'charge', 'collide', 'link', 'layout', 'intra', 'centroid', 'loop', 'linkRepul', 'parent'];
            const idx = modes.indexOf(state.forceVectorMode);
            state.forceVectorMode = modes[(idx + 1) % modes.length];
            if (!state.forceVectors) state.forceVectors = true;
            scheduleFrame();
        }
        if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.repeat) {
            e.preventDefault();
            if (unpopLastBubble()) {
                scheduleFrame();
            }
        }
    });
}
