// Undo a bubble pop: exact reverse using saved objects.

import { removePoppedContent, insertPoppedContent } from '../engines/force-engine.js';
import { getForceNodes } from './force-data.js';
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
        removedSegment,
        removedAnchors,
        addedNodes,
        addedObjects,
    } = popEntry;

    // 1. Remove everything that was added during pop
    const removeIids = (addedNodes || []).map(n => n.iid);
    if (removeIids.length > 0) {
        removePoppedContent(removeIids);
    }

    // Remove added objects from model store
    for (const obj of (addedObjects || [])) {
        removeObject(obj.id);
    }

    // 2. Restore the container: undo the split
    const container = getContainer(chainId);
    if (container) {
        // Remove the split segments from container
        container.segments = container.segments.filter(
            s => !(addedObjects || []).includes(s)
        );

        // Remove from poppedRanges
        const prIdx = container.poppedRanges.findIndex(pr => pr.bubbleId === bubbleId);
        if (prIdx !== -1) container.poppedRanges.splice(prIdx, 1);

        // Restore the old segment
        if (removedSegment) {
            container.segments.push(removedSegment);
            // Sort segments by tRange start
            container.segments.sort((a, b) => a.tRange.start - b.tRange.start);

            // Add to model store
            addObject(removedSegment);

            // Re-register the restored segment's ends
            for (const segId of removedSegment.ends.head) registerSeg(segId, removedSegment);
            for (const segId of removedSegment.ends.tail) registerSeg(segId, removedSegment);

            // Re-add restored segment's anchors to sim (if not already there)
            const existingIids = new Set(getForceNodes().map(n => n.iid));
            const anchorsToAdd = removedSegment.physicsNodes.filter(
                n => !existingIids.has(n.iid)
            );
            if (anchorsToAdd.length > 0) {
                insertPoppedContent(chainId, anchorsToAdd, []);
            }
        }
    }

    // 3. Re-add anchors that were removed during materialization
    if (removedAnchors && removedAnchors.length > 0) {
        const existingIids = new Set(getForceNodes().map(n => n.iid));
        const toAdd = removedAnchors.filter(n => !existingIids.has(n.iid));
        if (toAdd.length > 0) {
            insertPoppedContent(chainId, toAdd, []);
        }
    }

    console.log(`[unpop] undid ${bubbleId} on ${chainId}`);
    return true;
}
