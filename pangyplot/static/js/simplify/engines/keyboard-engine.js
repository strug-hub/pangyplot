// Global keyboard shortcuts not owned by a specific engine.

import { togglePhysicsDebug } from './physics-activation-engine.js';
import { setupExportHierarchyEngine } from './export-hierarchy-engine.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { replayHistory } from '../detail/engines/polychain/polychain-pop-engine.js';

export function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
        if (e.code === 'KeyL' && !e.repeat) {
            togglePhysicsDebug();
            scheduleFrame();
        }
        if (e.code === 'KeyR' && !e.repeat) {
            replayHistory();
        }
    });

    setupExportHierarchyEngine();
}
