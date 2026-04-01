// Chain pop/unpop state machine: force population, junction activation.
// POLYCHAIN PHYSICS EXPERIMENT: popping disabled.

import { state } from '../../../simplify-state.js';
import { clearForce } from '../force-engine.js';
import { clearFetchedRegion } from '../../data/polychain/polychain-fetcher.js';
import { resetSimplifyViewState } from '../../data/simplify-view-state.js';
import popTree from '../../data/pop-tree.js';

// ---------------------------------------------------------------
// Clear detail state (called by detail-transition-engine on fade-out complete)
// ---------------------------------------------------------------
export function clearDetailState() {
    clearFetchedRegion();
    state.detailData = null;
    clearForce();
    state.poppedChainIds.clear();
    resetSimplifyViewState();
    popTree.clear();
}

