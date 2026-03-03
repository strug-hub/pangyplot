// Auto-LOD: pick grid level based on zoom, with grid meter display.

import { state } from './simplify-state.js';

export function selectLevel() {
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const viewportWidth = cw / state.zoom;
    // Target ~2000 grid cells across viewport -- keeps resolution high
    state.targetCell = viewportWidth / 2000;

    // Levels sorted finest -> coarsest. Pick finest whose cellSize <= target.
    let best = 0;
    for (let i = state.data.levels.length - 1; i >= 0; i--) {
        if (state.data.levels[i].cellSize <= state.targetCell) {
            best = i;
            break;
        }
    }
    return best;
}

/** Build the grid meter bars once data is loaded. */
export function initGridMeter() {
    const meter = state.dom.gridMeter;
    meter.innerHTML = '';
    for (let i = 0; i < state.data.levels.length; i++) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        meter.appendChild(bar);
    }
}

/** Light up bars left to right as zoom increases (finer levels). */
export function updateGridMeter(levelIndex) {
    if (levelIndex === state.currentLevel) return;
    state.currentLevel = levelIndex;
    const bars = state.dom.gridMeter.children;
    const n = bars.length;
    // Bars laid out L→R: index 0 = coarsest, n-1 = finest.
    // Active when the bar's level (coarsest-first) is >= current level index.
    // levelIndex 0 = finest → all bars lit. levelIndex n-1 = coarsest → only first bar lit.
    for (let i = 0; i < n; i++) {
        bars[i].classList.toggle('active', i < n - levelIndex);
    }
}
