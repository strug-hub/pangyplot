// Adapter: bubble pop/unpop for the simplify force simulation.
// Delegates to SimObject-based V2 handlers in model/pop-handler.js.
// This file re-exports V2 functions and provides popAllBubblesOnChain.

import { state } from '../../simplify-state.js';
import { popBubbleCircleV2, popBubbleForceNodeV2 } from '../model/pop-handler.js';
import { getBubbleStore, getBubblePositions } from './bubble-meta-cache.js';

// Re-export V2 handlers under original names for any remaining importers
export { popBubbleCircleV2 as popBubbleCircle } from '../model/pop-handler.js';
export { popBubbleForceNodeV2 as popBubbleForceNode } from '../model/pop-handler.js';

/**
 * Pop all bubble circles on a chain sequentially.
 * Each bubble is popped as if the user Ctrl+clicked it.
 */
export async function popAllBubblesOnChain(chainId) {
    const store = getBubbleStore(chainId);
    if (!store || store.bubbles.length === 0) return;

    // Snapshot bubble IDs — the store mutates as we pop
    const bubbleIds = store.bubbles.map(b => b.id);

    for (let i = 0; i < bubbleIds.length; i++) {
        // Re-fetch positions each iteration (they shift after each pop)
        const currentPositions = getBubblePositions(chainId);
        const currentStore = getBubbleStore(chainId);
        if (!currentStore || !currentPositions) break;

        // Find this bubble in the current store (may have shifted index)
        const idx = currentStore.bubbles.findIndex(b => b.id === bubbleIds[i]);
        if (idx === -1) continue;  // already popped or removed

        const pos = currentPositions[idx];
        if (!pos) continue;

        const hit = { x: pos.x, y: pos.y, meta: pos.meta, chainId };
        await popBubbleCircleV2(hit);
    }
}
