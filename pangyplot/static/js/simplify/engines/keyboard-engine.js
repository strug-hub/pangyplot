// Global keyboard shortcuts not owned by a specific engine.

import { isDebugMode } from '@app-state';
import eventBus from '@event-bus';
import { state } from '../simplify-state.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { unpopLastBubble } from '../detail/data/bubble-unpop-adapter.js';
import { returnToSimplify } from './selection/selection-popup.js';
import { pauseSim, resumeSim } from '../detail/engines/force-engine.js';
import { handleDebugKey } from '@debug/debug-orchestrator.js';

// Turn off debug visuals when debug mode is disabled
eventBus.subscribe('app:debug-mode-changed', (enabled) => {
    if (!enabled) {
        state.forceVectors = false;
        state.forceVectorMode = 'all';
        scheduleFrame();
    }
});

export function setupKeyboardShortcuts(canvas) {
    let simPausedByKey = false;

    canvas.addEventListener('keydown', e => {
        if ((e.key === 'Control' || e.key === 'Shift') && !simPausedByKey) {
            simPausedByKey = true;
            pauseSim();
        }
        // Escape from core viewer → return to simplify canvas
        if (e.code === 'Escape' && state.coreViewerActive) {
            returnToSimplify();
            scheduleFrame();
            return;
        }
        if (handleDebugKey(e)) return;
        if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.repeat) {
            e.preventDefault();
            if (unpopLastBubble()) {
                scheduleFrame();
            }
        }
    });

    canvas.addEventListener('keyup', e => {
        if ((e.key === 'Control' || e.key === 'Shift') && simPausedByKey) {
            simPausedByKey = false;
            resumeSim();
        }
    });

    // Release if canvas loses focus while key is held
    canvas.addEventListener('blur', () => {
        if (simPausedByKey) {
            simPausedByKey = false;
            resumeSim();
        }
    });
}
