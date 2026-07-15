// Undo a bubble pop: exact reverse using saved objects.

import { removePoppedContent, insertPoppedContent } from '../engines/force-engine.js';
import { getForceNodes } from './force-data.js';
import popTree from './pop-tree.js';
import { getContainer, addObject, removeObject, forgetObject } from '../model/model-manager.js';
import { register as registerSeg, resolveForLink } from '../model/segment-registry.js';
import { reResolve as reResolvePath } from '../../engines/path-trace/path-trace-engine.js';

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
        destroyedLinkMeta,
        addedNodes,
        addedObjects,
    } = popEntry;

    // 1. Remove all nodes that were added during this pop + their links
    const removeIids = (addedNodes || []).map(n => n.iid);
    if (removeIids.length > 0) {
        removePoppedContent(removeIids);
    }

    // Remove added objects from model store WITHOUT unregistering ends.
    // destroy() would unregister shared segs that the restored segment needs.
    for (const obj of (addedObjects || [])) {
        forgetObject(obj.id);
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

    // 4. Recreate links that were destroyed during materialization.
    //    The registry now points to the restored anchors. Resolve fresh.
    const recreatedLinks = [];
    for (const meta of (destroyedLinkMeta || [])) {
        if (!meta.sourceId || !meta.targetId) continue;

        const linkForResolve = {
            source: meta.sourceId, target: meta.targetId,
            fromStrand: meta.fromStrand, toStrand: meta.toStrand,
        };

        const fromNode = resolveForLink(linkForResolve, meta.sourceId);
        const toNode = resolveForLink(linkForResolve, meta.targetId);
        if (!fromNode?.iid || !toNode?.iid) continue;

        recreatedLinks.push({
            isNode: false, isLink: true, class: 'link',
            iid: `${fromNode.iid}${meta.fromStrand}${toNode.iid}${meta.toStrand}`,
            source: fromNode.iid, target: toNode.iid,
            sourceIid: fromNode.iid, targetIid: toNode.iid,
            sourceId: meta.sourceId, targetId: meta.targetId,
            type: 'link', chainId,
            isDel: meta.isDel || false,
            isKinkLink: false, isRef: false, isDrawn: true,
            length: meta.length || 10, width: meta.width || 1,
            contained: meta.contained || [],
            frequency: meta.frequency || 0,
        });
    }

    if (recreatedLinks.length > 0) {
        insertPoppedContent(chainId, [], recreatedLinks);
    }

    reResolvePath();
    return true;
}
