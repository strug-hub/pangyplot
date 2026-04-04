/**
 * pop-handler.js — SimObject-based bubble pop for the simplify viewer.
 *
 * Container is the single source of truth:
 *   - Container owns the spine (physics), tracks popped bubbles
 *   - splitAtBubble creates PolychainSegments with anchor d3 nodes
 *   - Anchors go into D3 sim, registered in seg-registry
 *   - No createGapAtPop, no absorbPhantom, no chainGaps
 */

import { state } from '../../simplify-state.js';
import { spliceBubbleNodes, insertPoppedContent } from '../engines/force-engine.js';
import { getForceNodes, getForceLinks } from '../data/force-data.js';
import { recordPop } from '../../../utils/pop-history.js';
import popTree from '../data/pop-tree.js';
import { getPolychainNodesForChain } from '../data/polychain/polychain-adapter.js';
import { logPop, logNodes, logLinks } from '../data/pop-debug-log.js';
import { registerSeg, resolveSeg } from '../data/seg-registry.js';

import { getContainer, addObject } from './model-manager.js';
import { SegmentObject } from './segment-object.js';
import { BubbleObject } from './bubble-object.js';
import { markDeletionLinks } from './polychain-factory.js';
import * as modelRegistry from './segment-registry.js';

/**
 * Pop a bubble circle on a polychain.
 * Container handles the split; no old gap system.
 */
export async function popBubbleCircleV2(hit) {
    if (!hit || !hit.meta) return false;

    const bubbleId = hit.meta.id;
    const chainId = hit.chainId;
    const t = hit.meta.t;
    const chr = state.chromosome;
    if (!chr) return false;

    const pcNodes = getPolychainNodesForChain(chainId);
    if (!pcNodes || pcNodes.length < 2) return false;

    // --- Fetch /pop ---
    const url = `/pop?id=${encodeURIComponent(bubbleId)}`
        + `&genome=${encodeURIComponent(state.GENOME)}`
        + `&chromosome=${encodeURIComponent(chr)}`;

    let apiData;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        apiData = await resp.json();
    } catch (e) {
        console.warn('[pop-handler] fetch failed:', e);
        return false;
    }

    markDeletionLinks(apiData, bubbleId);

    const sourceSegs = (apiData.source_segs || []).map(s => `s${s}`);
    const sinkSegs = (apiData.sink_segs || []).map(s => `s${s}`);
    const boundaryIds = new Set([...sourceSegs, ...sinkSegs]);

    // --- Split container ---
    const container = getContainer(chainId);
    if (!container) {
        console.warn(`[pop-handler] No container for chain ${chainId}`);
        return false;
    }

    console.log(`[pop-handler] pre-split: container has ${container.bubbles.length} bubbles, ${container.segments.length} segments, popped=${container.poppedBubbles.size}`);
    const splitResult = container.splitAtBubble(bubbleId, t, 0.02, sourceSegs, sinkSegs);
    const { leftSegment, rightSegment, removedSegment, materializeHead, materializeTail } = splitResult;
    console.log(`[pop-handler] split result: left=${!!leftSegment}, right=${!!rightSegment}, materializeHead=[${materializeHead}], materializeTail=[${materializeTail}], segments now=${container.segments.length}`);

    // Register new segment anchor segs in old seg-registry
    if (leftSegment) {
        for (const segId of leftSegment.ends.head) registerSeg(segId, leftSegment.headAnchor);
        for (const segId of leftSegment.ends.tail) registerSeg(segId, leftSegment.tailAnchor);
    }
    if (rightSegment) {
        for (const segId of rightSegment.ends.head) registerSeg(segId, rightSegment.headAnchor);
        for (const segId of rightSegment.ends.tail) registerSeg(segId, rightSegment.tailAnchor);
    }

    // Boundary segs that are represented by anchors (not materialized)
    const anchoredBoundary = new Set(boundaryIds);
    for (const segId of materializeHead) anchoredBoundary.delete(segId);
    for (const segId of materializeTail) anchoredBoundary.delete(segId);

    // --- Create child SimObjects ---
    // Skip boundary segs that are represented by anchors.
    // Boundary segs marked for materialization (empty split side) pass through.
    const interiorNodes = (apiData.nodes || []).filter(n => !anchoredBoundary.has(String(n.id)));

    const childObjects = [];
    for (const node of interiorNodes) {
        let obj;
        if (node.type === 'segment') {
            obj = SegmentObject.fromApiNode(node, chainId);
        } else if (node.type === 'bubble') {
            obj = BubbleObject.fromApiNode(node, chainId);
        }
        if (obj) {
            childObjects.push(obj);
            addObject(obj);
        }
    }

    // Collect kink nodes + links
    const allChildNodes = [];
    const allChildLinks = [];
    for (const obj of childObjects) {
        allChildNodes.push(...obj.physicsNodes);
        allChildLinks.push(...obj.physicsLinks);
    }

    // Add anchor nodes from new segments (only those that were created)
    const anchorNodes = [
        ...(leftSegment ? leftSegment.physicsNodes : []),
        ...(rightSegment ? rightSegment.physicsNodes : []),
    ];

    // Combine: anchors + child kink nodes
    const allNewNodes = [...anchorNodes, ...allChildNodes];

    // --- Deduplicate nodes already in sim ---
    const existingNodeIds = new Set(getForceNodes().map(n => n.id));
    const newNodes = allNewNodes.filter(n => !existingNodeIds.has(n.id));
    const addedIds = new Set(newNodes.map(n => n.id));
    const newLinks = allChildLinks.filter(l => {
        if (!l.isKinkLink) return true;
        return addedIds.has(l.id);
    });

    if (newNodes.length === 0) return false;

    // --- Register child kink nodes in old seg-registry ---
    // Skip anchored boundary segs (they're on segment anchors).
    // Materialized boundary segs ARE registered (they're real nodes now).
    for (const n of newNodes) {
        if (n.id && !n.isAnchor && !anchoredBoundary.has(n.id)) {
            registerSeg(n.id, n);
        }
    }

    // Register child bubble interior segs → bubble's kink node
    for (const obj of childObjects) {
        if (obj.interior?.insideSegs) {
            for (const segId of obj.interior.insideSegs) {
                if (!anchoredBoundary.has(segId)) registerSeg(segId, obj.headNode);
            }
        }
        for (const segId of obj.ends.head) {
            if (!anchoredBoundary.has(segId)) registerSeg(segId, obj.headNode);
        }
        for (const segId of obj.ends.tail) {
            if (!anchoredBoundary.has(segId)) registerSeg(segId, obj.tailNode);
        }
    }

    // Register in model registry
    for (const obj of childObjects) {
        modelRegistry.registerAll(obj.ends.head, obj);
        modelRegistry.registerAll(obj.ends.tail, obj);
    }

    // --- Resolve GFA links ---
    const gfaLinks = [];
    for (const rawLink of (apiData.links || [])) {
        const fromSegId = String(rawLink.source).startsWith('s')
            ? String(rawLink.source) : `s${rawLink.source}`;
        const toSegId = String(rawLink.target).startsWith('s')
            ? String(rawLink.target) : `s${rawLink.target}`;

        const fromEntry = resolveSeg(fromSegId);
        const toEntry = resolveSeg(toSegId);
        if (!fromEntry || !toEntry) continue;

        const fromNode = fromEntry.node;
        const toNode = toEntry.node;
        if (!fromNode?.iid || !toNode?.iid) continue;

        const isDel = boundaryIds.has(fromSegId) && boundaryIds.has(toSegId);

        gfaLinks.push({
            isNode: false, isLink: true, class: 'link',
            iid: `${fromNode.iid}${rawLink.from_strand || '+'}${toNode.iid}${rawLink.to_strand || '+'}`,
            source: fromNode.iid,
            target: toNode.iid,
            sourceIid: fromNode.iid,
            targetIid: toNode.iid,
            sourceId: fromSegId,
            targetId: toSegId,
            type: 'link',
            isDel,
            isKinkLink: false, isRef: false, isDrawn: true,
            length: isDel ? 20 : 10,
            width: 1,
            contained: rawLink.contained || [],
            frequency: rawLink.frequency || 0,
            haplotype: rawLink.haplotype || null,
            bubbleId: isDel ? bubbleId : null,
        });
    }

    const allNewLinks = [...newLinks, ...gfaLinks];

    // --- Position: save layout, squish child nodes (not anchors) ---
    const childKinkNodes = newNodes.filter(n => !n.isAnchor);
    for (const node of childKinkNodes) {
        node.homeX = node.x;
        node.homeY = node.y;
    }
    if (childKinkNodes.length > 0) {
        let cx = 0, cy = 0;
        for (const n of childKinkNodes) { cx += n.x; cy += n.y; }
        cx /= childKinkNodes.length; cy /= childKinkNodes.length;
        const squish = 0.15;
        for (const n of childKinkNodes) {
            n.x = hit.x + (n.homeX - cx) * squish;
            n.y = hit.y + (n.homeY - cy) * squish;
        }
    }

    // --- Remove old segment anchors, insert new nodes + links ---
    // The old segment's anchors need to leave the sim
    const removeIids = removedSegment.physicsNodes
        .filter(n => existingNodeIds.has(n.id))
        .map(n => n.iid);

    logPop(bubbleId, chainId, {
        phase: 'start-v2',
        t, newNodes: newNodes.length,
        newLinks: allNewLinks.length,
        removeIids: removeIids.length,
    });

    insertPoppedContent(chainId, newNodes, allNewLinks);

    // Tag child nodes for forces
    for (const n of childKinkNodes) {
        n.popBubbleId = bubbleId;
        n.ghostRootId = chainId;
    }

    recordPop('bubble-circle-pop-v2', { id: bubbleId, chain: chainId });

    console.log(`[pop-handler] v2 pop ${bubbleId}: ${childObjects.length} objects, ` +
        `${newNodes.length} nodes (${anchorNodes.length} anchors), ${allNewLinks.length} links`);

    // Track for undo
    popTree.register(bubbleId, chainId, null, {
        isAnchorPop: true,
        isV2: true,
        bubbleId,
        chainId,
        childIids: newNodes.map(n => n.iid),
        childObjectIds: childObjects.map(o => o.id),
        sourceSegs: apiData.source_segs || [],
        sinkSegs: apiData.sink_segs || [],
        childBubbles: apiData.child_bubbles || [],
    });

    return true;
}

/**
 * Pop a bubble force node using SimObjects.
 */
export async function popBubbleForceNodeV2(bubbleNode) {
    if (!bubbleNode || bubbleNode.type !== 'bubble') return false;

    const bubbleId = bubbleNode.id;
    const chainId = bubbleNode.chainId;
    const chr = state.chromosome;
    if (!chr) return false;

    const url = `/pop?id=${encodeURIComponent(bubbleId)}`
        + `&genome=${encodeURIComponent(state.GENOME)}`
        + `&chromosome=${encodeURIComponent(chr)}`;

    let apiData;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        apiData = await resp.json();
    } catch (e) {
        console.warn('[pop-handler] fetch failed:', e);
        return false;
    }

    markDeletionLinks(apiData, bubbleId);

    const childObjects = [];
    for (const node of (apiData.nodes || [])) {
        let obj;
        if (node.type === 'segment') obj = SegmentObject.fromApiNode(node, chainId);
        else if (node.type === 'bubble') obj = BubbleObject.fromApiNode(node, chainId);
        if (obj) { childObjects.push(obj); addObject(obj); }
    }

    const allChildNodes = [];
    const allChildLinks = [];
    for (const obj of childObjects) {
        allChildNodes.push(...obj.physicsNodes);
        allChildLinks.push(...obj.physicsLinks);
    }

    const existingNodeIds = new Set(getForceNodes().map(n => n.id));
    const newChildNodes = allChildNodes.filter(n => !existingNodeIds.has(n.id));
    const addedIds = new Set(newChildNodes.map(n => n.id));
    const newChildLinks = allChildLinks.filter(l => {
        if (!l.isKinkLink) return true;
        return addedIds.has(l.id);
    });

    if (newChildNodes.length === 0) return false;

    for (const obj of childObjects) {
        modelRegistry.registerAll(obj.ends.head, obj);
        modelRegistry.registerAll(obj.ends.tail, obj);
    }

    for (const n of newChildNodes) {
        if (n.id) registerSeg(n.id, n);
    }
    for (const obj of childObjects) {
        if (obj.interior?.insideSegs) {
            for (const segId of obj.interior.insideSegs) registerSeg(segId, obj.headNode);
        }
        for (const segId of obj.ends.head) registerSeg(segId, obj.headNode);
        for (const segId of obj.ends.tail) registerSeg(segId, obj.tailNode);
    }

    // Resolve GFA links
    const gfaLinks = [];
    for (const rawLink of (apiData.links || [])) {
        const fromSegId = String(rawLink.source).startsWith('s') ? String(rawLink.source) : `s${rawLink.source}`;
        const toSegId = String(rawLink.target).startsWith('s') ? String(rawLink.target) : `s${rawLink.target}`;
        const fromEntry = resolveSeg(fromSegId);
        const toEntry = resolveSeg(toSegId);
        if (!fromEntry || !toEntry) continue;
        const fromNode = fromEntry.node, toNode = toEntry.node;
        if (!fromNode?.iid || !toNode?.iid) continue;
        gfaLinks.push({
            isNode: false, isLink: true, class: 'link',
            iid: `${fromNode.iid}${rawLink.from_strand || '+'}${toNode.iid}${rawLink.to_strand || '+'}`,
            source: fromNode.iid, target: toNode.iid,
            sourceIid: fromNode.iid, targetIid: toNode.iid,
            sourceId: fromSegId, targetId: toSegId,
            type: 'link', isDel: false,
            isKinkLink: false, isRef: false, isDrawn: true,
            length: 10, width: 1,
            contained: rawLink.contained || [],
        });
    }

    if (newChildNodes.length > 0) {
        let cx = 0, cy = 0;
        for (const n of newChildNodes) { cx += n.x; cy += n.y; }
        cx /= newChildNodes.length; cy /= newChildNodes.length;
        for (const n of newChildNodes) {
            n.homeX = n.x; n.homeY = n.y;
            n.x = bubbleNode.x + (n.homeX - cx) * 0.15;
            n.y = bubbleNode.y + (n.homeY - cy) * 0.15;
        }
    }

    const parentIids = new Set();
    for (const n of getForceNodes()) {
        if (n.id === bubbleId) parentIids.add(n.iid);
    }

    const externalLinks = getForceLinks().filter(l => {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        return parentIids.has(sIid) || parentIids.has(tIid);
    }).map(l => ({ ...l }));

    spliceBubbleNodes(parentIids, newChildNodes, [...newChildLinks, ...gfaLinks]);
    recordPop('bubble-force-pop-v2', { id: bubbleId, chain: chainId });

    popTree.register(bubbleId, chainId, null, {
        bubbleId, chainId, isV2: true,
        parentKinks: bubbleNode.kinks || 1,
        parentNode: { ...bubbleNode },
        childIids: newChildNodes.map(n => n.iid),
        childObjectIds: childObjects.map(o => o.id),
        childLinks: newChildLinks, externalLinks,
        sourceSegs: apiData.source_segs || [],
        sinkSegs: apiData.sink_segs || [],
        childBubbles: apiData.child_bubbles || [],
    });

    return true;
}
