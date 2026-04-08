// Skeleton↔detail fade transition and LOD-gated fetch scheduling.
// The skeleton layer owns the decision of when detail is appropriate.

import { state } from '../state.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { updateLOD } from './lod-engine.js';
import { updateDetailBar, updateDetailPhase } from '@debug/debug-status-bar.js';
import { layoutToBp, isReady } from './reference-spine-engine.js';
import { placeGenesFromSpine } from '@graph-data/gene-data.js';
import { getViewport } from '../render/viewport.js';


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
    // Inline: clear detail state (was polychain-pop-engine.clearDetailState)
    import('../detail/data/polychain/polychain-fetcher.js').then(m => m.clearFetchedRegion());
    import('../detail/data/detail-view-state.js').then(m => m.resetDetailViewState());
    import('../detail/data/pop-tree.js').then(m => m.default.clear());
    import('../detail/model/model-manager.js').then(m => m.clearModel());
    state.detailData = null;
    state.detailOpacity = 0;
    state.skeletonOpacity = 1;
    setDetailPhase('none');
    // Pins are already at spine positions from blending (t=1).
    // Just clear the detailOverride flag so spine-based updates resume.
    placeGenesFromSpine(false);
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
        // Hysteresis: enter detail at <= DETAIL_GRID_THRESHOLD,
        // exit at > DETAIL_EXIT_THRESHOLD, maintain in between.
        const inDetail = state.detailPhase !== 'none';
        const exitThreshold = state.DETAIL_EXIT_THRESHOLD;
        if (!inDetail && state.targetGridSize > state.DETAIL_GRID_THRESHOLD) {
            // Not in detail and not zoomed enough — nothing to do
            return;
        } else if (inDetail && state.targetGridSize > exitThreshold) {
            exitDetailMode();
        } else {
            if (!isReady()) return;
            const vp = getViewport();
            const dpr = window.devicePixelRatio || 1;
            const { fetchDetailForViewport } = await import(
                '../detail/data/polychain/polychain-fetcher.js');
            const ok = await fetchDetailForViewport({
                chr: state.chromosome,
                vp,
                canvasWidth: state.canvas.width / dpr,
                layoutToBp,
            });
            if (ok) beginFadeIn();
        }
    }, 200);
}
