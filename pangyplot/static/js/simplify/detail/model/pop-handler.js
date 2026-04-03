/**
 * pop-handler.js — SimObject-based bubble pop for the simplify viewer.
 *
 * This is the new pop path that replaces the old deserializeSubgraph +
 * createNodeElements + viewState + seg-registry pipeline with:
 *   createObjectsFromPop → SimObjects with renderer-compatible kink nodes
 *   resolveApiLink → unified registry resolution
 *   PolychainContainer.splitAtBubble → render mask + segment split
 *
 * The old gap/anchor machinery (createGapAtPop, ghost spine, chainGaps)
 * is NOT used. The PolychainContainer handles splits internally.
 */

import { state } from '../../../simplify-state.js';
import { spliceBubbleNodes, insertPoppedContent } from '../../engines/force-engine.js';
import { getForceNodes, getForceLinks } from '../force-data.js';
import { recordPop } from '../../../../utils/pop-history.js';
import popTree from '../pop-tree.js';
import { getPolychainNodesForChain, createGapAtPop, getChainGaps } from '../polychain/polychain-adapter.js';
import { removeBubbleFromStore } from '../bubble-meta-cache.js';
import { logPop, logNodes, logLinks, logChainState } from '../pop-debug-log.js';
import { registerSeg } from '../seg-registry.js';

import { getContainer } from './model-manager.js';
import { SegmentObject } from './segment-object.js';
import { BubbleObject } from './bubble-object.js';
import { markDeletionLinks, resolveApiLink } from './polychain-factory.js';
import * as modelRegistry from './segment-registry.js';

/**
 * Pop a bubble circle using SimObjects.
 *
 * Replaces the deserializeSubgraph path with direct SimObject creation.
 * Still uses the old gap/anchor system for polychain management (for now),
 * but creates SimObject kink nodes instead of record-based elements.
 *
 * @param {{ x, y, meta: { id, t, ... }, chainId }} hit
 * @returns {Promise<boolean>}
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

    // Mark deletion links
    markDeletionLinks(apiData, bubbleId);

    const sourceSegs = (apiData.source_segs || []).map(s => `s${s}`);
    const sinkSegs = (apiData.sink_segs || []).map(s => `s${s}`);
    const boundaryIds = new Set([...sourceSegs, ...sinkSegs]);

    // --- Create gap (still uses old system for polychain visual management) ---
    logChainState(chainId, pcNodes, getChainGaps(chainId));
    const gapInfo = createGapAtPop(chainId, bubbleId, apiData.source_segs || [], apiData.sink_segs || []);
    if (!gapInfo) return false;

    // --- Split model container (new system, in parallel) ---
    const container = getContainer(chainId);
    if (container) {
        try {
            container.splitAtBubble(bubbleId, t, 0.02, sourceSegs, sinkSegs);
        } catch (e) {
            console.warn('[pop-handler] container split failed:', e.message);
        }
    }

    // --- Create SimObjects from API response ---
    // Filter out boundary segs (anchors represent them), except shared segs
    const { sharedSegs } = gapInfo;
    const skipIds = new Set(boundaryIds);
    for (const seg of sharedSegs) skipIds.delete(seg);

    const interiorNodes = (apiData.nodes || []).filter(n => !skipIds.has(String(n.id)));

    // Create SimObjects
    const childObjects = [];
    for (const node of interiorNodes) {
        if (node.type === 'segment') {
            childObjects.push(SegmentObject.fromApiNode(node, chainId));
        } else if (node.type === 'bubble') {
            childObjects.push(BubbleObject.fromApiNode(node, chainId));
        }
    }

    // Collect all kink nodes and kink links from SimObjects
    const allChildNodes = [];
    const allChildLinks = [];
    for (const obj of childObjects) {
        allChildNodes.push(...obj.physicsNodes);
        allChildLinks.push(...obj.physicsLinks);
    }

    // --- Deduplicate nodes already in sim ---
    const existingNodeIds = new Set(getForceNodes().map(n => n.id));
    const newChildNodes = allChildNodes.filter(n => !existingNodeIds.has(n.id));
    const addedIds = new Set(newChildNodes.map(n => n.id));
    const newChildLinks = allChildLinks.filter(l => {
        if (!l.isKinkLink) return true;
        return addedIds.has(l.id);
    });

    if (newChildNodes.length === 0 && newChildLinks.length === 0) return false;

    // --- Resolve GFA links through model registry ---
    // Register child object ends in the model registry
    for (const obj of childObjects) {
        modelRegistry.registerAll(obj.ends.head, obj);
        modelRegistry.registerAll(obj.ends.tail, obj);
    }

    const gfaLinks = [];
    for (const rawLink of (apiData.links || [])) {
        const resolved = resolveApiLink(rawLink);
        if (!resolved) continue;

        gfaLinks.push({
            isNode: false,
            isLink: true,
            class: 'link',
            iid: `${resolved.fromNode.iid}${rawLink.from_strand || '+'}${resolved.toNode.iid}${rawLink.to_strand || '+'}`,
            source: resolved.fromNode.iid,
            target: resolved.toNode.iid,
            sourceIid: resolved.fromNode.iid,
            targetIid: resolved.toNode.iid,
            sourceId: String(rawLink.source),
            targetId: String(rawLink.target),
            type: 'link',
            isDel: resolved.isDeletion,
            isKinkLink: false,
            isRef: false,
            isDrawn: true,
            length: resolved.isDeletion ? 20 : 10,
            width: 1,
            contained: rawLink.contained || [],
            frequency: rawLink.frequency || 0,
            haplotype: rawLink.haplotype || null,
            bubbleId: resolved.isDeletion ? bubbleId : null,
        });
    }

    // Merge kink links + GFA links
    const allNewLinks = [...newChildLinks, ...gfaLinks];

    // --- Position: save layout, squish to bubble circle ---
    for (const node of newChildNodes) {
        node.homeX = node.x;
        node.homeY = node.y;
    }

    let layoutCx = 0, layoutCy = 0;
    for (const node of newChildNodes) { layoutCx += node.homeX; layoutCy += node.homeY; }
    layoutCx /= newChildNodes.length;
    layoutCy /= newChildNodes.length;
    const squish = 0.15;
    for (const node of newChildNodes) {
        node.x = hit.x + (node.homeX - layoutCx) * squish;
        node.y = hit.y + (node.homeY - layoutCy) * squish;
    }

    // --- Register in old seg-registry (for old link resolver compat) ---
    for (const n of newChildNodes) {
        if (n.id) registerSeg(n.id, n);
    }

    // --- Insert into force sim ---
    logPop(bubbleId, chainId, {
        phase: 'start-v2',
        t, newChildNodes: newChildNodes.length,
        newChildLinks: allNewLinks.length,
    });

    insertPoppedContent(chainId, newChildNodes, allNewLinks);

    // Tag nodes for forces
    for (const n of newChildNodes) {
        n.popBubbleId = bubbleId;
        n.ghostRootId = chainId;
    }

    // Remove bubble circle from meta cache
    const removedMeta = removeBubbleFromStore(chainId, bubbleId);

    recordPop('bubble-circle-pop-v2', { id: bubbleId, chain: chainId });

    logNodes('childNodes-v2', newChildNodes);
    logLinks('childLinks-v2', allNewLinks);
    logChainState(chainId, getPolychainNodesForChain(chainId), getChainGaps(chainId));
    logPop(bubbleId, chainId, { phase: 'done-v2' });

    // Track for undo
    popTree.register(bubbleId, chainId, null, {
        isAnchorPop: true,
        isV2: true,
        bubbleId,
        chainId,
        childIids: newChildNodes.map(n => n.iid),
        childObjectIds: childObjects.map(o => o.id),
        sourceSegs: apiData.source_segs || [],
        sinkSegs: apiData.sink_segs || [],
        childBubbles: apiData.child_bubbles || [],
        gapInfo,
        bubbleMeta: removedMeta,
    });

    console.log(`[pop-handler] v2 pop ${bubbleId}: ${childObjects.length} objects, ` +
        `${newChildNodes.length} nodes, ${allNewLinks.length} links (${gfaLinks.length} GFA)`);

    return true;
}

/**
 * Pop a bubble force node (already visible in the sim as a BubbleObject or kink node).
 * Removes the parent bubble, creates child SimObjects, splices into sim.
 *
 * @param {object} bubbleNode — force node with .id, .type, .chainId, .x, .y
 * @returns {Promise<boolean>}
 */
export async function popBubbleForceNodeV2(bubbleNode) {
    if (!bubbleNode || bubbleNode.type !== 'bubble') return false;

    const bubbleId = bubbleNode.id;
    const chainId = bubbleNode.chainId;
    const chr = state.chromosome;
    if (!chr) return false;

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

    // --- Create child SimObjects ---
    const childObjects = [];
    for (const node of (apiData.nodes || [])) {
        if (node.type === 'segment') {
            childObjects.push(SegmentObject.fromApiNode(node, chainId));
        } else if (node.type === 'bubble') {
            childObjects.push(BubbleObject.fromApiNode(node, chainId));
        }
    }

    const allChildNodes = [];
    const allChildLinks = [];
    for (const obj of childObjects) {
        allChildNodes.push(...obj.physicsNodes);
        allChildLinks.push(...obj.physicsLinks);
    }

    // Deduplicate
    const existingNodeIds = new Set(getForceNodes().map(n => n.id));
    const newChildNodes = allChildNodes.filter(n => !existingNodeIds.has(n.id));
    const addedIds = new Set(newChildNodes.map(n => n.id));
    const newChildLinks = allChildLinks.filter(l => {
        if (!l.isKinkLink) return true;
        return addedIds.has(l.id);
    });

    if (newChildNodes.length === 0) return false;

    // Register child ends in model registry
    for (const obj of childObjects) {
        modelRegistry.registerAll(obj.ends.head, obj);
        modelRegistry.registerAll(obj.ends.tail, obj);
    }

    // Resolve GFA links
    const gfaLinks = [];
    for (const rawLink of (apiData.links || [])) {
        const resolved = resolveApiLink(rawLink);
        if (!resolved) continue;
        gfaLinks.push({
            isNode: false, isLink: true, class: 'link',
            iid: `${resolved.fromNode.iid}${rawLink.from_strand || '+'}${resolved.toNode.iid}${rawLink.to_strand || '+'}`,
            source: resolved.fromNode.iid,
            target: resolved.toNode.iid,
            sourceIid: resolved.fromNode.iid,
            targetIid: resolved.toNode.iid,
            sourceId: String(rawLink.source),
            targetId: String(rawLink.target),
            type: 'link',
            isDel: resolved.isDeletion,
            isKinkLink: false, isRef: false, isDrawn: true,
            length: resolved.isDeletion ? 20 : 10,
            width: 1,
            contained: rawLink.contained || [],
            frequency: rawLink.frequency || 0,
            haplotype: rawLink.haplotype || null,
            bubbleId: resolved.isDeletion ? bubbleId : null,
        });
    }

    // Squish toward parent position
    if (newChildNodes.length > 0) {
        let cx = 0, cy = 0;
        for (const n of newChildNodes) { cx += n.x; cy += n.y; }
        cx /= newChildNodes.length; cy /= newChildNodes.length;
        const squish = 0.15;
        for (const n of newChildNodes) {
            n.homeX = n.x; n.homeY = n.y;
            n.x = bubbleNode.x + (n.homeX - cx) * squish;
            n.y = bubbleNode.y + (n.homeY - cy) * squish;
        }
    }

    // Register in old seg-registry for compat
    for (const n of newChildNodes) {
        if (n.id) registerSeg(n.id, n);
    }

    // Collect parent iids for removal
    const parentIids = new Set();
    for (const n of getForceNodes()) {
        if (n.id === bubbleId) parentIids.add(n.iid);
    }

    // Save external links for undo
    const externalLinks = getForceLinks().filter(l => {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        return parentIids.has(sIid) || parentIids.has(tIid);
    }).map(l => ({ ...l }));

    // Atomic splice: remove parent, add children
    const allNewLinks = [...newChildLinks, ...gfaLinks];
    spliceBubbleNodes(parentIids, newChildNodes, allNewLinks);

    recordPop('bubble-force-pop-v2', { id: bubbleId, chain: chainId });

    // Track for undo
    popTree.register(bubbleId, chainId, null, {
        bubbleId,
        chainId,
        isV2: true,
        parentKinks: bubbleNode.kinks || 1,
        parentNode: { ...bubbleNode },
        childIids: newChildNodes.map(n => n.iid),
        childObjectIds: childObjects.map(o => o.id),
        childLinks: newChildLinks,
        externalLinks,
        sourceSegs: apiData.source_segs || [],
        sinkSegs: apiData.sink_segs || [],
        childBubbles: apiData.child_bubbles || [],
    });

    console.log(`[pop-handler] v2 force-pop ${bubbleId}: ${childObjects.length} objects, ` +
        `${newChildNodes.length} nodes, ${allNewLinks.length} links`);

    return true;
}
