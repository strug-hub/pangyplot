// Debug view orchestrator: registry, key dispatch, active view state.
// No rendering — delegates drawing to views and HUD.

import { isDebugMode } from '@app-state';
import eventBus from '@event-bus';
import { scheduleFrame } from '../utils/frame-scheduler.js';

const views = [];       // registered view descriptors
let activeView = null;  // current view descriptor or null

export function registerView(view) {
    views.push(view);
}

export function getViews() { return views; }
export function getActiveView() { return activeView; }

export function handleDebugKey(e) {
    if (!isDebugMode()) return false;

    // Check registered views for matching key
    for (const view of views) {
        if (e.code === view.key && !e.repeat) {
            if (activeView === view) {
                activeView = null;
            } else {
                activeView = view;
                if (view.onActivate) view.onActivate();
            }
            scheduleFrame();
            return true;
        }
        // Sub-key cycling within active view
        if (activeView === view && view.subKeys) {
            for (const sub of view.subKeys) {
                if (e.code === sub.key && !e.repeat) {
                    sub.action();
                    if (!activeView) activeView = view;
                    scheduleFrame();
                    return true;
                }
            }
        }
    }
    return false;
}

// Clear debug state when debug mode is disabled
eventBus.subscribe('app:debug-mode-changed', (enabled) => {
    if (!enabled) {
        activeView = null;
        for (const view of views) {
            if (view.onDeactivate) view.onDeactivate();
        }
        scheduleFrame();
    }
});
