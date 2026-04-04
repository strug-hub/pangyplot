/**
 * pop-handler.js — SimObject-based bubble pop for the simplify viewer.
 *
 * Container splits, child SimObjects created, GFA links resolved.
 * Only ends are registered. Interior segs are invisible to the link system.
 */

import { state } from '../../simplify-state.js';
import { insertPoppedContent, removePoppedContent } from '../engines/force-engine.js';
import { getForceNodes } from '../data/force-data.js';
import { getPolychainNodesForChain } from '../data/polychain/polychain-adapter.js';
import { registerSeg, resolveSeg } from '../data/seg-registry.js';

import { getContainer, addObject, removeObject } from './model-manager.js';
import { SegmentObject } from './segment-object.js';
import { BubbleObject } from './bubble-object.js';

/**
 * Pop a bubble circle on a polychain.
 * Splits the chain visually — no child nodes yet.
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

    // --- Fetch /pop (need source_segs and sink_segs for anchor registration) ---
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

    const sourceSegs = (apiData.source_segs || []).map(s => `s${s}`);
    const sinkSegs = (apiData.sink_segs || []).map(s => `s${s}`);

    // --- Split container ---
    const container = getContainer(chainId);
    if (!container) {
        console.warn(`[pop-handler] No container for chain ${chainId}`);
        return false;
    }

    const splitResult = container.splitAtBubble(bubbleId, t, sourceSegs, sinkSegs);
    const { leftSegment, rightSegment, removedSegment } = splitResult;

    // --- Swap anchors in D3 sim ---
    // Remove old segment's anchors
    const removeIids = removedSegment.physicsNodes.map(n => n.iid);
    // Collect old anchor iids that are actually in the sim
    const existingIids = new Set(getForceNodes().map(n => n.iid));
    const iidsToRemove = removeIids.filter(iid => existingIids.has(iid));
    if (iidsToRemove.length > 0) {
        removePoppedContent(iidsToRemove);
    }

    // Add new segments' anchors to sim
    const newAnchors = [];
    if (leftSegment) newAnchors.push(...leftSegment.physicsNodes);
    if (rightSegment) newAnchors.push(...rightSegment.physicsNodes);

    if (newAnchors.length > 0) {
        insertPoppedContent(chainId, newAnchors, []);
    }

    // --- Register anchor segs in old seg-registry ---
    if (leftSegment) {
        for (const segId of leftSegment.ends.head) registerSeg(segId, leftSegment.headAnchor);
        for (const segId of leftSegment.ends.tail) registerSeg(segId, leftSegment.tailAnchor);
    }
    if (rightSegment) {
        for (const segId of rightSegment.ends.head) registerSeg(segId, rightSegment.headAnchor);
        for (const segId of rightSegment.ends.tail) registerSeg(segId, rightSegment.tailAnchor);
    }

    // --- Update model store ---
    removeObject(removedSegment.id);
    if (leftSegment) addObject(leftSegment);
    if (rightSegment) addObject(rightSegment);

    // --- Step 3: Create child SimObjects ---
    const boundaryIds = new Set([...sourceSegs, ...sinkSegs]);

    // Filter out boundary seg nodes (anchors represent them)
    const interiorApiNodes = (apiData.nodes || []).filter(n =>
        !boundaryIds.has(String(n.id)));

    const childObjects = [];
    for (const node of interiorApiNodes) {
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

    // Register each object's ends only in seg-registry
    for (const obj of childObjects) {
        for (const segId of obj.ends.head) registerSeg(segId, obj.headNode);
        for (const segId of obj.ends.tail) registerSeg(segId, obj.tailNode);
    }

    // Collect kink nodes + kink links from child objects
    const childNodes = [];
    const childKinkLinks = [];
    for (const obj of childObjects) {
        childNodes.push(...obj.physicsNodes);
        childKinkLinks.push(...obj.physicsLinks);
    }

    // --- Resolve GFA links ---
    // Both endpoints must be registered ends. Skip if either is missing.
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

        gfaLinks.push({
            isNode: false, isLink: true, class: 'link',
            iid: `${fromNode.iid}${rawLink.from_strand || '+'}${toNode.iid}${rawLink.to_strand || '+'}`,
            source: fromNode.iid, target: toNode.iid,
            sourceIid: fromNode.iid, targetIid: toNode.iid,
            sourceId: fromSegId, targetId: toSegId,
            type: 'link',
            isDel: boundaryIds.has(fromSegId) && boundaryIds.has(toSegId),
            isKinkLink: false, isRef: false, isDrawn: true,
            length: 10, width: 1,
            contained: rawLink.contained || [],
            frequency: rawLink.frequency || 0,
            haplotype: rawLink.haplotype || null,
        });
    }

    // --- Position: squish child nodes to bubble circle position ---
    if (childNodes.length > 0) {
        let cx = 0, cy = 0;
        for (const n of childNodes) { cx += n.x; cy += n.y; }
        cx /= childNodes.length; cy /= childNodes.length;
        const squish = 0.15;
        for (const n of childNodes) {
            n.homeX = n.x; n.homeY = n.y;
            n.x = hit.x + (n.homeX - cx) * squish;
            n.y = hit.y + (n.homeY - cy) * squish;
        }
    }

    // --- Add child nodes + links to D3 sim ---
    const allNewLinks = [...childKinkLinks, ...gfaLinks];
    if (childNodes.length > 0) {
        insertPoppedContent(chainId, childNodes, allNewLinks);
    }

    // Tag child nodes for forces
    for (const n of childNodes) {
        n.popBubbleId = bubbleId;
        n.ghostRootId = chainId;
    }

    console.log(`[pop-handler] pop ${bubbleId} on ${chainId}: ` +
        `left=${!!leftSegment} right=${!!rightSegment}, ` +
        `${childObjects.length} objects, ${childNodes.length} nodes, ${gfaLinks.length} GFA links`);

    return true;
}

/**
 * Pop a bubble force node (placeholder — not yet reimplemented).
 */
export async function popBubbleForceNodeV2(bubbleNode) {
    console.warn('[pop-handler] popBubbleForceNodeV2 not yet reimplemented');
    return false;
}
