// Adapter: fetch /pop for a bubble node in the simplify force simulation,
// deserialize the response, and splice child nodes/links into the sim.

import { state } from '../../simplify-state.js';
import { spliceBubbleNodes, spliceChainAtBubble } from '../engines/force-engine.js';
import { getForceNodes, getForceLinks } from './force-data.js';
import { deserializeSubgraph } from '../../../graph/data/records/deserializer/deserialize-subgraph.js';
import simplifyViewState from './simplify-view-state.js';
import { recordPop } from '../../../utils/pop-history.js';
import { getPolychainNodesForChain } from './polychain/polychain-adapter.js';
import { removeBubbleFromStore } from './bubble-meta-cache.js';

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

    // Position new children near the parent bubble
    for (const node of newChildNodes) {
        node.x = bubbleNode.x + (Math.random() - 0.5) * 20;
        node.y = bubbleNode.y + (Math.random() - 0.5) * 20;
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

    // Track for undo — capture enough state to reverse the pop
    if (!state._bubblePopStack) state._bubblePopStack = [];
    state._bubblePopStack.push({
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
    const chainId = hit.chainId;
    const t = hit.meta.t;
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

    // Build existing records for fallback resolution
    const existingRecords = new Map();
    for (const n of getForceNodes()) {
        if (n.record && !existingRecords.has(n.id) && n.chainId !== '__junction__') {
            existingRecords.set(n.id, n.record);
        }
    }

    // Deserialize subgraph
    const { nodes: childNodes, links: childLinks, recordMap } = deserializeSubgraph(apiData, {
        tag: { chainId },
        linkResolver: (segId) => {
            const plainId = segId.startsWith('s') ? segId.slice(1) : segId;
            return simplifyViewState.resolve(plainId) || existingRecords.get(segId) || null;
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

    // Deduplicate nodes already in sim
    const existingNodeIds = new Set(getForceNodes().map(n => n.id));
    const newChildNodes = childNodes.filter(n => !existingNodeIds.has(n.id));
    const addedIds = new Set(newChildNodes.map(n => n.id));
    const newChildLinks = childLinks.filter(l => {
        if (!l.isKinkLink) return true;
        return addedIds.has(l.id);
    });

    if (newChildNodes.length === 0 && newChildLinks.length === 0) return false;

    // Position child nodes near the bubble circle
    for (const node of newChildNodes) {
        node.x = hit.x + (Math.random() - 0.5) * 20;
        node.y = hit.y + (Math.random() - 0.5) * 20;
    }

    // Splice chain at bubble position
    const spliceResult = spliceChainAtBubble(
        chainId, t, pcNodes, newChildNodes, newChildLinks,
        apiData.source_segs || [], apiData.sink_segs || [],
        recordMap,
    );
    if (!spliceResult) return false;

    recordPop('bubble-circle-pop', { id: bubbleId, chain: chainId });

    // Remove the bubble circle from the meta cache
    const removedMeta = removeBubbleFromStore(chainId, bubbleId);

    // Push undo entry
    if (!state._bubblePopStack) state._bubblePopStack = [];
    state._bubblePopStack.push({
        isChainSplitPop: true,
        bubbleId,
        chainId,
        parentRecord,
        childIids: newChildNodes.map(n => n.iid),
        sourceSegs: apiData.source_segs || [],
        sinkSegs: apiData.sink_segs || [],
        childBubbles: apiData.child_bubbles || [],
        removedLink: spliceResult.removedLink,
        bridgeLinks: spliceResult.bridgeLinks,
        bubbleMeta: removedMeta,
    });

    return true;
}
