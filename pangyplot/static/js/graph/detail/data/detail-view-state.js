// Detail-scoped ViewState instance.
// Tracks segment→bubble ownership for link resolution within the viewer.

import { ViewState } from '../../data/view-state.js';

const detailViewState = new ViewState();

export default detailViewState;

export function resetDetailViewState() {
    detailViewState.clear();
}

/**
 * Surgically remove all viewState entries belonging to a set of chain IDs.
 * Iterates segmentToNode and removes entries whose record was registered
 * by one of the given chains (matched by record ownership, not seg scanning).
 * @param {Set<string>} chainIds
 * @param {Array} chains - chain objects with sourceSegs, sinkSegs
 */
export function unregisterChains(chainIds, chains) {
    // Collect all seg IDs owned by these chains (source + sink + any inside segs
    // registered via the adapter's registerBubble calls).
    // We can't directly know which inside segs belong to which chain, so we
    // remove entries whose record maps back to a chain being removed.
    // For the seg-level ownership (source/sink segs of the chain itself),
    // we can remove directly.
    for (const chain of chains) {
        if (!chainIds.has(chain.id)) continue;
        for (const sid of (chain.sourceSegs || [])) {
            detailViewState.segmentToNode.delete(sid);
        }
        for (const sid of (chain.sinkSegs || [])) {
            detailViewState.segmentToNode.delete(sid);
        }
    }
}
