// Undo a bubble pop: removes child nodes, merges container segments back.

import { removePoppedContent } from '../engines/force-engine.js';
import popTree from './pop-tree.js';
import { getContainer, addObject, removeObject } from '../model/model-manager.js';
import { registerSeg } from './seg-registry.js';

/**
 * Undo the most recent bubble pop. Returns true on success.
 */
export function unpopLastBubble() {
    const popEntry = popTree.undoLast();
    if (!popEntry) return false;

    const {
        bubbleId,
        chainId,
        childObjectIds,
        materializedObjectIds,
        allNodeIids,
        innerAnchorIids,
    } = popEntry;

    // 1. Remove all child nodes + materialized segs + their links from sim
    const removeIids = [...(allNodeIids || []), ...(innerAnchorIids || [])];
    if (removeIids.length > 0) {
        removePoppedContent(removeIids);
    }

    // 2. Remove child objects from model store
    for (const objId of (childObjectIds || [])) {
        removeObject(objId);
    }
    for (const objId of (materializedObjectIds || [])) {
        removeObject(objId);
    }

    // 3. Merge container segments back
    const container = getContainer(chainId);
    if (container) {
        try {
            const mergeResult = container.mergeAtBubble(bubbleId);
            // Add merged segment to model store, remove old split segments
            if (mergeResult) {
                for (const seg of mergeResult.removedSegments) removeObject(seg.id);
                addObject(mergeResult.mergedSegment);

                // Re-register merged segment ends
                const merged = mergeResult.mergedSegment;
                for (const segId of merged.ends.head) registerSeg(segId, merged);
                for (const segId of merged.ends.tail) registerSeg(segId, merged);
            }
        } catch (e) {
            console.warn('[unpop] container merge failed:', e.message);
        }
    }

    console.log(`[unpop] undid ${bubbleId} on ${chainId}`);
    return true;
}
