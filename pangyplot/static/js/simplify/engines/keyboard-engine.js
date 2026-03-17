// Global keyboard shortcuts not owned by a specific engine.

import { state } from '../simplify-state.js';
import { togglePhysicsDebug } from './physics-activation-engine.js';
import { setupExportHierarchyEngine } from './export-hierarchy-engine.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { replayHistory } from '../detail/engines/polychain/polychain-pop-engine.js';
import { unpopLastBubble } from '../detail/data/bubble-unpop-adapter.js';

export function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
        if (e.code === 'KeyL' && !e.repeat) {
            togglePhysicsDebug();
            scheduleFrame();
        }
        if (e.code === 'KeyY' && !e.repeat) {
            state.forceVectors = !state.forceVectors;
            scheduleFrame();
        }
        if (e.code === 'KeyR' && !e.repeat) {
            replayHistory();
        }
        if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.repeat) {
            e.preventDefault();
            if (unpopLastBubble()) {
                scheduleFrame();
            }
        }
    });

    setupExportHierarchyEngine();
}
