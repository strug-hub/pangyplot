// Chain pop/unpop state machine: force population, junction activation.
// POLYCHAIN PHYSICS EXPERIMENT: popping disabled.

import { state } from '../../../simplify-state.js';
import { clearForce } from '../force-engine.js';
import { clearFetchedRegion } from '../../data/polychain/polychain-fetcher.js';
import { resetSimplifyViewState } from '../../data/simplify-view-state.js';

// ---------------------------------------------------------------
// Clear detail state (called by detail-transition-engine on fade-out complete)
// ---------------------------------------------------------------
export function clearDetailState() {
    clearFetchedRegion();
    state.detailData = null;
    clearForce();
    state.activeSeedChainId = null;
    state.poppedChainIds.clear();
    resetSimplifyViewState();
    state._bubblePopStack = [];
}

/**
 * Toggle pop/unpop for a chain. Called from Ctrl+click handler.
 * Polychain physics experiment: popping disabled.
 */
export function togglePopChain(chain) {
    return;
}
