// Engine orchestrator: sets up all interaction engines.

import { state } from '../simplify-state.js';
import { setupPanZoom } from './navigation/pan-zoom-engine.js';
import { setupHover } from './selection/hover-engine.js';
import { setupMultiSelection } from './selection/multi-selection-engine.js';
import { setupKeyboardShortcuts } from './keyboard-engine.js';

export function setupEngines() {
    const canvas = state.canvas;
    setupPanZoom(canvas);
    setupHover(canvas);
    setupMultiSelection(canvas);
    setupKeyboardShortcuts();
}
