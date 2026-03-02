// Auto-LOD: pick grid level based on zoom, with manual offset.

import { state } from './simplify-state.js';

export function selectLevel() {
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const viewportWidth = cw / state.zoom;
    // Target ~2000 grid cells across viewport -- keeps resolution high
    const targetCell = viewportWidth / 2000;

    // Levels sorted finest -> coarsest. Pick finest whose cellSize <= target.
    let best = 0;
    for (let i = state.data.levels.length - 1; i >= 0; i--) {
        if (state.data.levels[i].cellSize <= targetCell) {
            best = i;
            break;
        }
    }
    // Apply manual offset, clamped to valid range
    const final = Math.max(0, Math.min(state.data.levels.length - 1, best + state.levelOffset));
    return final;
}

export function updateLodDisplay() {
    const el = state.dom.lodOffset;
    if (state.levelOffset === 0) {
        el.textContent = 'AUTO';
        el.style.color = '#0ff';
    } else {
        const sign = state.levelOffset > 0 ? '+' : '';
        el.textContent = `${sign}${state.levelOffset}`;
        el.style.color = '#ff0';
    }
}
