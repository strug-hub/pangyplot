// Physics activation engine: debug toggle + dirty recompute orchestration.
// Toggled with L key. Manages which chains are activated for physics.

import { state } from '../simplify-state.js';
import { getViewport } from '../render/viewport.js';
import { computeActivationSet } from '../detail/data/polychain/activation-data.js';

let debugActive = false;
let activationSet = null;

let lastVpCenterX = 0;
let lastVpCenterY = 0;
let lastVpWidth = 0;
let lastZoom = 0;

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export function togglePhysicsDebug() {
    debugActive = !debugActive;
    state.physicsDebug = debugActive;
    if (debugActive) {
        recompute();
        logActivationSet();
    } else {
        console.log('[physics-zone] OFF');
    }
}

export function isPhysicsDebugActive() {
    return debugActive;
}

export function getActivationSet() {
    if (!state.detailData) return null;
    recomputeIfDirty();
    return activationSet;
}

export function getSeedChainId() {
    const set = getActivationSet();
    return set ? set.seed : null;
}

// ---------------------------------------------------------------
// Internal recompute
// ---------------------------------------------------------------

function recompute() {
    if (!state.detailData) {
        activationSet = null;
        return;
    }
    const vp = getViewport();
    activationSet = computeActivationSet(
        state.detailData.chains,
        state.detailData.chainAdjacency,
        vp,
        state.PHYSICS_NODE_BUDGET,
    );
    lastVpCenterX = (vp.minX + vp.maxX) / 2;
    lastVpCenterY = (vp.minY + vp.maxY) / 2;
    lastVpWidth = vp.maxX - vp.minX;
    lastZoom = state.zoom;
}

function logActivationSet() {
    if (!activationSet) {
        console.log('[physics-zone] no activation set');
        return;
    }
    const { seed, activated, totalClippedCost, budget } = activationSet;
    const totalChains = state.detailData?.chains.length || 0;

    console.groupCollapsed(`[physics-zone] ON -- seed: ${seed}, chains: ${activated.size}/${totalChains}, cost: ${totalClippedCost}/${budget}`);

    console.log('--- adjacency ---');
    for (const chain of (state.detailData?.chains || [])) {
        const inSet = activated.has(chain.id);
        const info = inSet ? activated.get(chain.id) : null;
        const tag = inSet ? `depth=${info.depth} cost=${info.clippedCost}` : 'NOT activated';
        console.log(`  ${chain.id}: -- ${tag}`);
    }

    console.groupEnd();
}

export function recomputeIfDirty() {
    if (!state.detailData) { activationSet = null; return; }
    const vp = getViewport();
    const cx = (vp.minX + vp.maxX) / 2;
    const cy = (vp.minY + vp.maxY) / 2;
    const vpW = vp.maxX - vp.minX;

    const threshold = (lastVpWidth || vpW) * 0.05;
    const dirty = !activationSet
        || Math.abs(cx - lastVpCenterX) > threshold
        || Math.abs(cy - lastVpCenterY) > threshold
        || Math.abs(state.zoom - lastZoom) / (lastZoom || 1) > 0.1;

    if (dirty) recompute();
}
