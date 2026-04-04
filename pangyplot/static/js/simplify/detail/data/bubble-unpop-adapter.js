// Undo a bubble pop: exact reverse using saved objects.

import { removePoppedContent, insertPoppedContent } from '../engines/force-engine.js';
import { getForceNodes, getForceLinks } from './force-data.js';
import popTree from './pop-tree.js';
import { getContainer, addObject, removeObject } from '../model/model-manager.js';
import { registerSeg, resolveEndForLink } from './seg-registry.js';

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

    // 1. Save links where ONE end is being removed but the OTHER survives.
    //    These are cross-pop links (e.g. b16540's children → anchor → b16539's children).
    //    Links where BOTH ends are removed are internal to this pop and don't need restoring.
    const removeIidSet = new Set((addedNodes || []).map(n => n.iid));
    const crossLinks = getForceLinks().filter(l => {
        const sIid = l.source?.iid ?? l.source;
        const tIid = l.target?.iid ?? l.target;
        const sRemoved = removeIidSet.has(sIid);
        const tRemoved = removeIidSet.has(tIid);
        return (sRemoved && !tRemoved) || (!sRemoved && tRemoved);
    });

    // Remove all nodes that were added during this pop + their links
    if (removeIidSet.size > 0) {
        removePoppedContent([...removeIidSet]);
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
            container.segments.sort((a, b) => a.tRange.start - b.tRange.start);

            // Restore anchor ownership (splitAt changed simObject to the split segments)
            removedSegment.headAnchor.simObject = removedSegment;
            removedSegment.tailAnchor.simObject = removedSegment;

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

    // 4. Re-resolve destroyed links through the updated registry.
    //    The registry now points to the restored segment's anchors.
    const restoredLinks = [];
    for (const link of crossLinks) {
        const fromSegId = link.sourceId;
        const toSegId = link.targetId;
        if (!fromSegId || !toSegId) continue;

        const fromNode = resolveEndForLink(fromSegId, link);
        const toNode = resolveEndForLink(toSegId, link);
        if (!fromNode?.iid || !toNode?.iid) {
            console.log(`[unpop] link skip: ${fromSegId}→${toSegId}, from=${fromNode?.iid ?? 'null'} to=${toNode?.iid ?? 'null'}`);
            continue;
        }

        // Update the link's endpoints to the resolved nodes
        link.source = fromNode.iid;
        link.target = toNode.iid;
        link.sourceIid = fromNode.iid;
        link.targetIid = toNode.iid;
        restoredLinks.push(link);
    }

    if (restoredLinks.length > 0) {
        insertPoppedContent(chainId, [], restoredLinks);
    }

    console.log(`[unpop] undid ${bubbleId} on ${chainId}, re-resolved ${restoredLinks.length} links`);
    return true;
}
