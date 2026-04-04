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
import { registerSeg, resolveEndForLink } from '../data/seg-registry.js';

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
    const { leftSegment, rightSegment, removedSegment, newAnchors } = splitResult;

    // --- Add only NEW inner anchors to D3 sim ---
    // Outer anchors are reused (same d3 nodes) so existing links stay valid.
    if (newAnchors.length > 0) {
        insertPoppedContent(chainId, newAnchors, []);
    }

    // --- Register segment ends in seg-registry (SimObjects, not raw nodes) ---
    if (leftSegment) {
        for (const segId of leftSegment.ends.head) registerSeg(segId, leftSegment);
        for (const segId of leftSegment.ends.tail) registerSeg(segId, leftSegment);
    }
    if (rightSegment) {
        for (const segId of rightSegment.ends.head) registerSeg(segId, rightSegment);
        for (const segId of rightSegment.ends.tail) registerSeg(segId, rightSegment);
    }

    // --- Update model store ---
    removeObject(removedSegment.id);
    if (leftSegment) addObject(leftSegment);
    if (rightSegment) addObject(rightSegment);

    // --- Materialize boundary segs where a side is empty ---
    // When a split side has no bubbles, the boundary seg becomes a real
    // SegmentObject replacing the anchor. Remove old anchor + its links,
    // the new kink node takes over in the registry.
    const { materializeHead, materializeTail } = splitResult;
    const materializedSegIds = new Set([...materializeHead, ...materializeTail]);

    for (const segId of materializedSegIds) {
        // Find the API node for this boundary seg
        const apiNode = (apiData.nodes || []).find(n => String(n.id) === segId);
        if (!apiNode) continue;

        const obj = SegmentObject.fromApiNode(apiNode, chainId);
        addObject(obj);

        // Register SimObject ends (overwrites old anchor registration)
        for (const sid of obj.ends.head) registerSeg(sid, obj);
        for (const sid of obj.ends.tail) registerSeg(sid, obj);

        // Remove the old anchor that tracked this seg + any links to it
        // The anchor is on the removedSegment (it wasn't reused since hasLeft/hasRight was false)
        const oldAnchor = materializeHead.includes(segId)
            ? removedSegment.headAnchor
            : removedSegment.tailAnchor;
        if (oldAnchor) {
            removePoppedContent([oldAnchor.iid]);
        }

        // Add kink nodes to sim (will be positioned + linked in GFA resolution below)
        insertPoppedContent(chainId, obj.physicsNodes, obj.physicsLinks);

        // Tag for forces — position at the anchor's location (no squish needed,
        // boundary segs are single points at the gap edge)
        for (const n of obj.physicsNodes) {
            n.popBubbleId = bubbleId;
            n.ghostRootId = chainId;
            n.homeX = n.x; n.homeY = n.y;
        }
    }

    // --- Step 3: Create child SimObjects ---
    const boundaryIds = new Set([...sourceSegs, ...sinkSegs]);

    // Filter out boundary seg nodes — anchors or materialized objects handle them
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

    // Register each object's ends in seg-registry (SimObjects, not raw nodes)
    for (const obj of childObjects) {
        for (const segId of obj.ends.head) registerSeg(segId, obj);
        for (const segId of obj.ends.tail) registerSeg(segId, obj);
    }

    // Collect kink nodes + kink links from child objects
    const childNodes = [];
    const childKinkLinks = [];
    for (const obj of childObjects) {
        childNodes.push(...obj.physicsNodes);
        childKinkLinks.push(...obj.physicsLinks);
    }

    // --- Resolve GFA links ---
    // Both endpoints must be registered ends. The SimObject resolves
    // the correct d3 node (strand-aware for kinked segments).
    const gfaLinks = [];
    for (const rawLink of (apiData.links || [])) {
        const fromSegId = String(rawLink.source).startsWith('s')
            ? String(rawLink.source) : `s${rawLink.source}`;
        const toSegId = String(rawLink.target).startsWith('s')
            ? String(rawLink.target) : `s${rawLink.target}`;

        // Build link-like object for resolveEnd
        const linkForResolve = {
            source: fromSegId, target: toSegId,
            fromStrand: rawLink.from_strand || '+',
            toStrand: rawLink.to_strand || '+',
        };

        const fromNode = resolveEndForLink(fromSegId, linkForResolve);
        const toNode = resolveEndForLink(toSegId, linkForResolve);
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

    // --- Position: center children between the two inner anchors ---
    if (childNodes.length > 0) {
        // Midpoint between the gap's inner anchors
        const leftAnchor = leftSegment?.tailAnchor;
        const rightAnchor = rightSegment?.headAnchor;
        const spawnX = leftAnchor && rightAnchor
            ? (leftAnchor.x + rightAnchor.x) / 2
            : (leftAnchor?.x ?? rightAnchor?.x ?? hit.x);
        const spawnY = leftAnchor && rightAnchor
            ? (leftAnchor.y + rightAnchor.y) / 2
            : (leftAnchor?.y ?? rightAnchor?.y ?? hit.y);

        let cx = 0, cy = 0;
        for (const n of childNodes) { cx += n.x; cy += n.y; }
        cx /= childNodes.length; cy /= childNodes.length;
        const squish = 0.15;
        for (const n of childNodes) {
            n.homeX = n.x; n.homeY = n.y;
            n.x = spawnX + (n.homeX - cx) * squish;
            n.y = spawnY + (n.homeY - cy) * squish;
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
