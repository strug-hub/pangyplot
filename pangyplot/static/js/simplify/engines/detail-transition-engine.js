// Skeleton↔detail fade transition and LOD-gated fetch scheduling.
// The skeleton layer owns the decision of when detail is appropriate.

import { state } from '../simplify-state.js';
import { scheduleFrame } from '../render-manager.js';
import { updateLOD } from './lod-engine.js';
import { updateDetailBar, updateDetailPhase, updateDetailOpacityReadout } from '../ui/status-bar.js';
import { xToBp, isReady } from '../skeleton/engines/reference-spine-engine.js';
import { getViewport } from '../render/viewport.js';
import { getLevel } from '../skeleton/data/skeleton-data.js';

let fadeStartTime = 0;
let fetchTimer = null;

// ---------------------------------------------------------------
// Detail phase state machine
// ---------------------------------------------------------------
export function setDetailPhase(phase) {
    state.detailPhase = phase;
    updateDetailPhase();
    if (phase !== 'none') updateDetailBar();
}

export function beginFadeIn() {
    if (state.detailPhase === 'none') {
        fadeStartTime = performance.now();
        setDetailPhase('fading-in');
        scheduleFadeFrame();
    } else if (state.detailPhase === 'fading-out') {
        fadeStartTime = performance.now() - state.detailOpacity * state.FADE_DURATION;
        setDetailPhase('fading-in');
        scheduleFadeFrame();
    }
}

export function exitDetailMode() {
    if (state.detailPhase === 'none' || state.detailPhase === 'fading-out') return;
    fadeStartTime = performance.now();
    setDetailPhase('fading-out');
    scheduleFadeFrame();
}

function finishExit() {
    import('../detail/engines/polychain/polychain-pop-engine.js').then(m => m.clearDetailState());
    state.detailOpacity = 0;
    state.skeletonOpacity = 1;
    setDetailPhase('none');
    scheduleFrame();
}

export function updateDetailOpacity() {
    const now = performance.now();
    const elapsed = now - fadeStartTime;
    const t = Math.min(1, elapsed / state.FADE_DURATION);

    if (state.detailPhase === 'fading-in') {
        state.detailOpacity = t;
        state.skeletonOpacity = Math.max(0.06, 1 - t);

        if (t < 1) {
            scheduleFadeFrame();
        } else {
            state.detailOpacity = 1;
            state.skeletonOpacity = 0.06;
            setDetailPhase('static');
        }
    } else if (state.detailPhase === 'fading-out') {
        state.detailOpacity = 1 - t;
        state.skeletonOpacity = Math.max(0.06, t);

        if (t < 1) {
            scheduleFadeFrame();
        } else {
            finishExit();
            return;
        }
    }
    updateDetailOpacityReadout();
}

export function scheduleFadeFrame() {
    requestAnimationFrame(() => {
        if (state.detailPhase === 'fading-in' || state.detailPhase === 'fading-out') {
            updateDetailOpacity();
            scheduleFrame();
        }
    });
}

// ---------------------------------------------------------------
// Debounced LOD-gated fetch scheduling
// ---------------------------------------------------------------
export function scheduleDetailFetch() {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(async () => {
        updateLOD();
        if (state.targetGridSize > state.DETAIL_GRID_THRESHOLD) {
            state.detailSuppressed = false;
            exitDetailMode();
        } else if (state.detailSuppressed) {
            exitDetailMode();
        } else {
            if (!isReady()) return;
            const vp = getViewport();
            const dpr = window.devicePixelRatio || 1;
            const gridSize = getLevel()?.gridSize || 50;
            const { fetchDetailForViewport } = await import(
                '../detail/data/polychain/polychain-fetcher.js');
            const ok = await fetchDetailForViewport({
                chr: state.chromosome,
                vp,
                canvasWidth: state.canvas.width / dpr,
                expandThreshold: Math.round(gridSize * 2),
                xToBp,
            });
            if (ok) beginFadeIn();
        }
    }, 200);
}
