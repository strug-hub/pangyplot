// Adapter: bubble pop/unpop for the simplify force simulation.
// Delegates to SimObject-based V2 handlers in model/pop-handler.js.
// This file re-exports V2 functions and provides popAllBubblesOnChain.

import { state } from '../../simplify-state.js';
import { popBubbleCircleV2, popBubbleForceNodeV2 } from '../model/pop-handler.js';
import { getBubbleStore } from './bubble-meta-cache.js';
import { getContainer } from '../model/model-manager.js';

// Re-export V2 handlers under original names for any remaining importers
export { popBubbleCircleV2 as popBubbleCircle } from '../model/pop-handler.js';
export { popBubbleForceNodeV2 as popBubbleForceNode } from '../model/pop-handler.js';

/**
 * Pop all bubble circles on a chain sequentially.
 * Each bubble is popped as if the user Ctrl+clicked it.
 */
export async function popAllBubblesOnChain(chainId) {
    const container = getContainer(chainId);
    if (!container || container.bubbles.length === 0) return;

    // Snapshot bubble IDs from the container
    const bubbleIds = container.bubbles.map(b => b.id);
    const metaStore = getBubbleStore(chainId);

    for (const bubbleId of bubbleIds) {
        // Skip already-popped bubbles
        if (container.poppedRanges.some(pr => pr.bubbleId === bubbleId)) continue;

        // Find bubble in container to get its t
        const bubble = container.bubbles.find(b => b.id === bubbleId);
        if (!bubble) continue;

        // Get position from container
        const pos = container.positionAt(bubble.t);

        // Build meta from cache (match by t if ID doesn't match)
        let meta = null;
        if (metaStore?.bubbles) {
            meta = metaStore.bubbles.find(b => b.id === bubbleId)
                || metaStore.bubbles.find(b => Math.abs(b.t - bubble.t) < 0.001);
        }

        const hit = { x: pos.x, y: pos.y, meta: meta || { id: bubbleId, t: bubble.t }, chainId };
        await popBubbleCircleV2(hit);
    }
}
