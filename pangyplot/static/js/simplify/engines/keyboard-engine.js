// Global keyboard shortcuts not owned by a specific engine.

import { isDebugMode } from '@app-state';
import eventBus from '@event-bus';
import { state } from '../simplify-state.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { unpopLastBubble } from '../detail/data/bubble-unpop-adapter.js';
import { returnToSimplify } from './selection/selection-popup.js';

// Turn off debug visuals when debug mode is disabled
eventBus.subscribe('app:debug-mode-changed', (enabled) => {
    if (!enabled) {
        state.forceVectors = false;
        state.forceVectorMode = 'all';
        scheduleFrame();
    }
});

export function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
        // Escape from core viewer → return to simplify canvas
        if (e.code === 'Escape' && state.coreViewerActive) {
            returnToSimplify();
            scheduleFrame();
            return;
        }
        if (isDebugMode() && e.code === 'KeyY' && !e.repeat) {
            state.forceVectors = !state.forceVectors;
            state.forceVectorMode = 'all';
            scheduleFrame();
        }
        if (isDebugMode() && e.code === 'KeyU' && !e.repeat) {
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
