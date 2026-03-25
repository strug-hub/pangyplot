// LOD engine: updates state.currentLOD and state.targetGridSize each frame.
// Called from the render manager's draw loop before rendering.

import { state } from '../simplify-state.js';
import { getAllLevelMeta } from '@simplify-data/chromosome-data.js';

export function updateLOD() {
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const viewportWidth = cw / state.zoom;
    // Target ~2000 grid units across viewport
    state.targetGridSize = viewportWidth / 2000;

    const meta = getAllLevelMeta();
    let best = 0;
    for (let i = meta.length - 1; i >= 0; i--) {
        if (meta[i].gridSize <= state.targetGridSize) {
            best = i;
            break;
        }
    }
    state.currentLOD = best;
}
