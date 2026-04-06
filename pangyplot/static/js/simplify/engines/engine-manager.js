// Engine orchestrator: sets up all interaction engines.

import { state } from '../simplify-state.js';
import { setupPanZoom } from './navigation/pan-zoom-engine.js';
import { setupHover } from './selection/hover-engine.js';
import { setupMultiSelection } from './selection/multi-selection-engine.js';
import { setupKeyboardShortcuts } from './keyboard-engine.js';
import { setupContextMenu } from './simplify-context-menu.js';
import { setupDragEngine } from './drag/drag-engine.js';
import { setupAnnotationLabelDrag } from './annotation-label-drag-engine.js';
import { setupPathTraceEngine } from './path-trace/path-trace-engine.js';

export function setupEngines() {
    const canvas = state.canvas;
    canvas.style.cursor = 'grab';

    // Make canvas focusable so keyboard shortcuts only fire when it has focus
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('mousedown', () => canvas.focus({ preventScroll: true }));

    setupPanZoom(canvas);
    setupHover(canvas);
    setupAnnotationLabelDrag(canvas);
    setupDragEngine(canvas);
    setupMultiSelection(canvas);
    setupKeyboardShortcuts(canvas);
    setupContextMenu(canvas);
    setupPathTraceEngine();
}
