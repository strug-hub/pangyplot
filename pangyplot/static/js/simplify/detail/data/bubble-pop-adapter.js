// Adapter: fetch /pop for a bubble node in the simplify force simulation,
// deserialize the response, and splice child nodes/links into the sim.

import { state } from '../../simplify-state.js';
import { spliceBubbleNodes, insertPoppedContent } from '../engines/force-engine.js';
import { getForceNodes, getForceLinks } from './force-data.js';
import { deserializeSubgraph } from '../../../graph/data/records/deserializer/deserialize-subgraph.js';
import simplifyViewState from './simplify-view-state.js';
import { recordPop } from '../../../utils/pop-history.js';
import popTree from './pop-tree.js';
import { getPolychainNodesForChain, createGapAtPop, getChainGaps } from './polychain/polychain-adapter.js';
import { removeBubbleFromStore, getBubbleStore, getBubblePositions } from './bubble-meta-cache.js';
import { logPop, logGap, logNodes, logLinks, logChainState } from './pop-debug-log.js';
import { registerSeg, resolveAllLinks, resolveSegAsRecord } from './seg-registry.js';

/**
 * Pop a bubble force node: fetch its subgraph, remove the parent,
 * and insert child nodes/links into the running simulation.
 * Returns true on success.
 */
export async function popBubbleForceNode(bubbleNode) {
    if (!bubbleNode || bubbleNode.type !== 'bubble') return false;

    const bubbleId = bubbleNode.id;       // e.g. "b123"
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
        console.warn('[bubble-pop-adapter] fetch failed:', e);
        return false;
    }

    // Mark deletion links: source→sink bypasses
    const sourceSet = new Set((apiData.source_segs || []).map(String));
    const sinkSet = new Set((apiData.sink_segs || []).map(String));
    for (const rawLink of (apiData.links || [])) {
        const src = rawLink.source.slice(1);   // strip "s" prefix
        const tgt = rawLink.target.slice(1);
        if ((sourceSet.has(src) && sinkSet.has(tgt)) ||
            (sinkSet.has(src) && sourceSet.has(tgt))) {
            rawLink.is_deletion = true;
            rawLink.bubble_id = bubbleId;
        }
    }

    // Build a lookup of existing force node records for fallback resolution
    // (handles segments already visible from prior pops, not tracked by viewState)
    // Skip junction nodes — their connectivity is handled by the junction layer.
    const existingRecords = new Map();
    for (const n of getForceNodes()) {
        if (n.record && !existingRecords.has(n.id) && n.chainId !== '__junction__') {
            existingRecords.set(n.id, n.record);
        }
    }

    // Deserialize subgraph with viewState-aware link resolution
    const { nodes: childNodes, links: childLinks, recordMap } = deserializeSubgraph(apiData, {
        tag: { chainId },
        linkResolver: (segId) => {
            // Strip "s" prefix for viewState lookup
            const plainId = segId.startsWith('s') ? segId.slice(1) : segId;
            // First: segment owned by a collapsed bubble
            // Second: segment visible as itself from a prior pop
            return simplifyViewState.resolve(plainId) || existingRecords.get(segId) || null;
        },
    });

    // Capture inside segs before expand destroys the mapping
    const parentRecord = bubbleNode.record;
    const insideSegs = [];
    if (parentRecord) {
        for (const [segId, record] of simplifyViewState.segmentToNode) {
            if (record === parentRecord) insideSegs.push(segId);
        }
    }

    // Expand simplify viewState: unmap parent bubble, register child bubbles
    if (parentRecord && apiData.child_bubbles) {
        simplifyViewState.expand(
            parentRecord,
            apiData.source_segs || [],
            apiData.sink_segs || [],
            apiData.child_bubbles,
            (id) => recordMap.get(id) || null,
        );
    }

    // Deduplicate: shared boundary segments may already be in the sim
    // from a previously popped neighbor (mirrors core's updateExistingNodeRecords)
    const existingNodeIds = new Set(getForceNodes().map(n => n.id));
    const newChildNodes = childNodes.filter(n => !existingNodeIds.has(n.id));
    const addedIds = new Set(newChildNodes.map(n => n.id));
    const newChildLinks = childLinks.filter(l => {
        if (!l.isKinkLink) return true;
        return addedIds.has(l.id); // kink links carry the node's id
    });

    // Squish child nodes toward the bubble's sim position so they start
    // as a tight cluster and expand out via spawn damping.
    if (newChildNodes.length > 0) {
        let layoutCx = 0, layoutCy = 0;
        for (const node of newChildNodes) { layoutCx += node.x; layoutCy += node.y; }
        layoutCx /= newChildNodes.length;
        layoutCy /= newChildNodes.length;
        const squish = 0.15;
        for (const node of newChildNodes) {
            node.x = bubbleNode.x + (node.x - layoutCx) * squish;
            node.y = bubbleNode.y + (node.y - layoutCy) * squish;
        }
    }

    if (newChildNodes.length === 0 && newChildLinks.length === 0) return false;

    // Collect iids of the parent bubble's kink nodes
    const parentIids = new Set();
    for (const n of getForceNodes()) {
        if (n.id === bubbleId) parentIids.add(n.iid);
    }

    // Collect external links touching the parent (for undo)
    const externalLinks = getForceLinks().filter(l => {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        return parentIids.has(sIid) || parentIids.has(tIid);
    }).map(l => ({ ...l }));  // shallow-copy before splice removes them

    // Atomic splice: remove parent + its links, add children + GFA links.
    // Inter-chain links are re-resolved via viewState (endpointSegId + strand).
    spliceBubbleNodes(parentIids, newChildNodes, newChildLinks);
    recordPop('bubble-pop', { id: bubbleId, chain: chainId });

    // Determine parent in pop hierarchy
    const parentBubbleId = parentRecord && popTree.has(parentRecord.id)
        ? parentRecord.id : null;

    // Track for undo via pop tree
    popTree.register(bubbleId, chainId, parentBubbleId, {
        bubbleId,
        chainId,
        parentRecord: parentRecord,
        parentKinks: bubbleNode.kinks || 1,
        parentNode: bubbleNode,
        childIids: newChildNodes.map(n => n.iid),
        childLinks: newChildLinks,
        externalLinks,
        sourceSegs: apiData.source_segs || [],
        sinkSegs: apiData.sink_segs || [],
        childBubbles: apiData.child_bubbles || [],
        insideSegs,
    });

    return true;
}

/**
 * Pop a bubble circle drawn on a polychain spline.
 * Splits the parent chain at the bubble's position and inserts
 * the popped subgraph into the force simulation.
 *
 * @param {{ x, y, meta: { id, t, ... }, chainId }} hit - from hitTestBubbleCircles
 * @returns {Promise<boolean>} true on success
 */
export async function popBubbleCircle(hit) {
    if (!hit || !hit.meta) return false;

    const bubbleId = hit.meta.id;
    const chainId = hit.chainId;     // could be original or subchain from prior pop
    const t = hit.meta.t;            // local t within this (sub)chain
    const chr = state.chromosome;
    if (!chr) return false;

    const pcNodes = getPolychainNodesForChain(chainId);
    if (!pcNodes || pcNodes.length < 2) return false;

    const url = `/pop?id=${encodeURIComponent(bubbleId)}`
        + `&genome=${encodeURIComponent(state.GENOME)}`
        + `&chromosome=${encodeURIComponent(chr)}`;

    let apiData;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        apiData = await resp.json();
    } catch (e) {
        console.warn('[bubble-pop-adapter] fetch failed:', e);
        return false;
    }

    // Mark deletion links (source→sink bypasses)
    const sourceSet = new Set((apiData.source_segs || []).map(String));
    const sinkSet = new Set((apiData.sink_segs || []).map(String));
    for (const rawLink of (apiData.links || [])) {
        const src = rawLink.source.slice(1);
        const tgt = rawLink.target.slice(1);
        if ((sourceSet.has(src) && sinkSet.has(tgt)) ||
            (sinkSet.has(src) && sourceSet.has(tgt))) {
            rawLink.is_deletion = true;
            rawLink.bubble_id = bubbleId;
        }
    }

    // Deserialize subgraph. The linkResolver resolves external segments
    // through: (1) viewState for collapsed bubbles, (2) the unified
    // segment registry for everything else (chain endpoints, junctions,
    // anchors, prior pops).
    const { nodes: childNodes, links: childLinks, recordMap } = deserializeSubgraph(apiData, {
        tag: { chainId },
        linkResolver: (segId) => {
            const plainId = segId.startsWith('s') ? segId.slice(1) : segId;
            // 1. Collapsed bubble ownership
            const vsRecord = simplifyViewState.resolve(plainId);
            if (vsRecord) return vsRecord;
            // 2. Unified segment registry (chain endpoints, junctions, anchors, prior pops)
            return resolveSegAsRecord(plainId);
        },
    });

    // Expand simplify viewState
    const parentRecord = simplifyViewState.resolve(bubbleId.replace(/^b/, ''));
    if (parentRecord && apiData.child_bubbles) {
        simplifyViewState.expand(
            parentRecord,
            apiData.source_segs || [],
            apiData.sink_segs || [],
            apiData.child_bubbles,
            (id) => recordMap.get(id) || null,
        );
    }

    // Mark source/sink boundary seg nodes as hidden — they're represented
    // visually by anchors but stay in the sim for GFA link connectivity.
    const boundarySegIds = new Set([
        ...(apiData.source_segs || []).map(s => `s${s}`),
        ...(apiData.sink_segs || []).map(s => `s${s}`),
    ]);

    // Deduplicate nodes already in sim
    const existingNodeIds = new Set(getForceNodes().map(n => n.id));
    const newChildNodes = childNodes.filter(n => !existingNodeIds.has(n.id));
    // Mark boundary seg nodes as hidden (exist for physics, not rendered)
    for (const n of newChildNodes) {
        if (boundarySegIds.has(n.id)) n.isBoundarySeg = true;
    }
    const addedIds = new Set(newChildNodes.map(n => n.id));
    const newChildLinks = childLinks.filter(l => {
        if (!l.isKinkLink) return true;
        return addedIds.has(l.id);
    });

    if (newChildNodes.length === 0 && newChildLinks.length === 0) return false;

    // Save ODGI layout positions as homeX/homeY before squishing —
    // the layout force pulls nodes toward these true layout coordinates.
    for (const node of newChildNodes) {
        node.homeX = node.x;
        node.homeY = node.y;
    }

    // Squish x,y so nodes start as a tight cluster at the bubble circle's
    // position and expand out via the spawn damping force.
    let layoutCx = 0, layoutCy = 0;
    for (const node of newChildNodes) { layoutCx += node.homeX; layoutCy += node.homeY; }
    layoutCx /= newChildNodes.length;
    layoutCy /= newChildNodes.length;
    const squish = 0.15;  // start at 15% of true spread from center
    for (const node of newChildNodes) {
        node.x = hit.x + (node.homeX - layoutCx) * squish;
        node.y = hit.y + (node.homeY - layoutCy) * squish;
    }

    // --- DEBUG: log pre-pop state ---
    logLinks('childLinks', newChildLinks);
    logPop(bubbleId, chainId, {
        phase: 'start',
        t: hit.meta.t,
        newChildNodes: newChildNodes.length,
        newChildLinks: newChildLinks.length,
        sourceSegs: apiData.source_segs,
        sinkSegs: apiData.sink_segs,
    });
    logChainState(chainId, getPolychainNodesForChain(chainId), getChainGaps(chainId));

    // Create gap at the popped bubble's position using neighbor bubbles as boundaries.
    // Must be called BEFORE removeBubbleFromStore so the bubble is still in the store.
    // Pass the popped bubble's own source/sink segs for bridge tracking during absorption.
    const gapInfo = createGapAtPop(chainId, bubbleId, apiData.source_segs || [], apiData.sink_segs || []);
    if (!gapInfo) return false;

    logGap(chainId, gapInfo.gapEntry, 'created');

    // Pin boundary seg nodes to their anchor's position and fix them there.
    // They exist for GFA link connectivity but are visually represented by anchors.
    const sourceSegSet = new Set((apiData.source_segs || []).map(s => `s${s}`));
    const sinkSegSet = new Set((apiData.sink_segs || []).map(s => `s${s}`));
    for (const n of newChildNodes) {
        if (!n.isBoundarySeg) continue;
        const anchor = sourceSegSet.has(n.id) ? gapInfo.leftNode
                     : sinkSegSet.has(n.id) ? gapInfo.rightNode
                     : null;
        if (anchor) {
            n.x = anchor.x; n.y = anchor.y;
            n.fx = anchor.x; n.fy = anchor.y;  // pin to anchor
            n.homeX = anchor.x; n.homeY = anchor.y;
        }
    }

    // Register each popped child node's seg ID in the unified registry.
    // Boundary segs stay registered to anchors (don't override).
    for (const n of newChildNodes) {
        if (n.isBoundarySeg) continue;  // anchors keep their registration
        const segId = n.id ? n.id.replace(/^s/, '') : null;
        if (segId) registerSeg(segId, n);
    }

    // Add child nodes + links to the force sim
    insertPoppedContent(chainId, newChildNodes, newChildLinks);

    // Re-resolve all links through the segment registry. This auto-rewires
    // existing inter-chain/junction links to point to anchors (which
    // registered the boundary seg IDs), effectively creating the bridge
    // connections. No explicit bridge link creation needed.
    resolveAllLinks(getForceLinks());

    // Log links touching this gap's anchors (auto-resolved, no explicit bridges)
    const gapAnchors = [gapInfo.gapEntry.anchorL, gapInfo.gapEntry.anchorR].filter(Boolean);
    const anchorLinks = getForceLinks().filter(l =>
        gapAnchors.some(a => l.source === a || l.target === a));
    logLinks('anchor-resolved-links', anchorLinks);

    // Log all non-kink links involving child nodes (to spot spurious connections)
    const childIidSet = new Set(newChildNodes.map(n => n.iid));
    const childGfaLinks = getForceLinks().filter(l => {
        if (l.isKinkLink || l.isBridgeLink || l.isPolychainLink) return false;
        const s = l.source?.iid ?? l.source;
        const t = l.target?.iid ?? l.target;
        return childIidSet.has(s) || childIidSet.has(t);
    });
    logLinks('childGfaLinks', childGfaLinks);

    logNodes('childNodes', newChildNodes);

    // Track child iids on the gap entry (for undo)
    gapInfo.gapEntry.childIids = newChildNodes.map(n => n.iid);

    // ghostRootId: guide force chain projection. popBubbleId: deletion force matching.
    for (const n of newChildNodes) {
        n.popBubbleId = bubbleId;
        n.ghostRootId = chainId;
    }

    // Remove the popped bubble circle from the meta cache
    const removedMeta = removeBubbleFromStore(chainId, bubbleId);

    recordPop('bubble-circle-pop', { id: bubbleId, chain: chainId });

    // --- DEBUG: log post-pop state ---
    logChainState(chainId, getPolychainNodesForChain(chainId), getChainGaps(chainId));
    logPop(bubbleId, chainId, { phase: 'done' });

    // Determine parent in pop hierarchy
    const parentBubbleId = parentRecord && popTree.has(parentRecord.id)
        ? parentRecord.id : null;

    // Track for undo via pop tree
    popTree.register(bubbleId, chainId, parentBubbleId, {
        isAnchorPop: true,
        bubbleId,
        chainId,
        parentRecord,
        childIids: newChildNodes.map(n => n.iid),
        sourceSegs: apiData.source_segs || [],
        sinkSegs: apiData.sink_segs || [],
        childBubbles: apiData.child_bubbles || [],
        gapInfo,
        bubbleMeta: removedMeta,
    });

    return true;
}

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
        await popBubbleCircle(hit);
    }
}
