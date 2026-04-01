// Adapter: fetch /pop for a bubble node in the simplify force simulation,
// deserialize the response, and splice child nodes/links into the sim.

import { state } from '../../simplify-state.js';
import { spliceBubbleNodes, spliceChainAtBubble, removeFullyPoppedChain } from '../engines/force-engine.js';
import { getForceNodes, getForceLinks } from './force-data.js';
import { deserializeSubgraph } from '../../../graph/data/records/deserializer/deserialize-subgraph.js';
import simplifyViewState from './simplify-view-state.js';
import { recordPop } from '../../../utils/pop-history.js';
import popTree from './pop-tree.js';
import { getPolychainNodesForChain, splitChainOnPop, getSegToPolychainRecord, removeChainEntirely } from './polychain/polychain-adapter.js';
import { removeBubbleFromStore, getBubbleStore, splitBubbleStore } from './bubble-meta-cache.js';

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

    // Build existing records for fallback resolution
    const existingRecords = new Map();
    for (const n of getForceNodes()) {
        if (n.record && !existingRecords.has(n.id) && n.chainId !== '__junction__') {
            existingRecords.set(n.id, n.record);
        }
    }

    // Build junction record map for cross-chain link resolution
    const junctionRecordMap = new Map();
    for (const n of getForceNodes()) {
        if (n.chainId === '__junction__' && n.record && !junctionRecordMap.has(n.id)) {
            junctionRecordMap.set(n.id, n.record);
        }
    }

    // Deserialize subgraph with enhanced link resolution
    const { nodes: childNodes, links: childLinks, recordMap } = deserializeSubgraph(apiData, {
        tag: { chainId },
        linkResolver: (segId) => {
            const plainId = segId.startsWith('s') ? segId.slice(1) : segId;
            // 1. Collapsed bubble ownership
            const vsRecord = simplifyViewState.resolve(plainId);
            if (vsRecord) return vsRecord;
            // 2. Visible force nodes from prior pops
            const existing = existingRecords.get(segId);
            if (existing) return existing;
            // 3. Polychain endpoint nodes on other chains
            const pcRecord = getSegToPolychainRecord(segId);
            if (pcRecord) return pcRecord;
            // 4. Junction force nodes
            const jRecord = junctionRecordMap.get(segId);
            if (jRecord) return jRecord;
            return null;
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

    // Child nodes have x,y from ODGI layout (absolute). Translate so the centroid
    // is at the bubble circle's sim position, then squish toward center so they
    // start in a tight cluster and expand out via the spawn damping force.
    let layoutCx = 0, layoutCy = 0;
    for (const node of newChildNodes) { layoutCx += node.x; layoutCy += node.y; }
    layoutCx /= newChildNodes.length;
    layoutCy /= newChildNodes.length;
    const squish = 0.15;  // start at 15% of true spread from center
    for (const node of newChildNodes) {
        node.x = hit.x + (node.x - layoutCx) * squish;
        node.y = hit.y + (node.y - layoutCy) * squish;
    }

    // Splice the chain at the bubble circle's rendered position (bridge links + child nodes)
    const spliceResult = spliceChainAtBubble(
        chainId, hit.x, hit.y, pcNodes, newChildNodes, newChildLinks,
        apiData.source_segs || [], apiData.sink_segs || [],
        recordMap,
    );
    if (!spliceResult) return false;

    // Remove the bubble circle from the meta cache (before splitting the store)
    const removedMeta = removeBubbleFromStore(chainId, bubbleId);

    // Split chain into two real subchains (updates detailData.chains + polychain nodes)
    const splitResult = splitChainOnPop(
        chainId, spliceResult.splitIdx, bubbleId,
        apiData.source_segs || [], apiData.sink_segs || [],
    );

    // Split the bubble store using the popped bubble's t value as the partition
    // boundary. Bubble t values are index-based (not arc-length), so we must
    // use the same coordinate system — the popped bubble's own t is the natural
    // split point in bubble-t space.
    const bubbleTSplit = hit.meta.t;
    let tSplit = bubbleTSplit;
    if (splitResult) {
        const { leftCount, rightCount } = splitBubbleStore(
            chainId, splitResult.leftChain.id, splitResult.rightChain.id, bubbleTSplit);
        splitResult.leftChain.nBubbles = leftCount;
        splitResult.leftChain.size = leftCount;
        splitResult.rightChain.nBubbles = rightCount;
        splitResult.rightChain.size = rightCount;
    }

    recordPop('bubble-circle-pop', { id: bubbleId, chain: chainId });

    // Check if either subchain is now fully popped → remove it
    let chainRemoval = null;
    if (splitResult) {
        for (const sub of [splitResult.leftChain, splitResult.rightChain]) {
            const store = getBubbleStore(sub.id);
            if (store && store.bubbles.length === 0) {
                const removalInfo = removeChainEntirely(sub.id);
                const rewireInfo = removeFullyPoppedChain(removalInfo.chainIds);
                if (!chainRemoval) chainRemoval = [];
                chainRemoval.push({ id: sub.id, ...removalInfo, ...rewireInfo });
            }
        }
    }

    // Determine parent in pop hierarchy
    const parentBubbleId = parentRecord && popTree.has(parentRecord.id)
        ? parentRecord.id : null;

    // Track for undo via pop tree
    popTree.register(bubbleId, chainId, parentBubbleId, {
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
        splitResult,
        tSplit,
        bubbleMeta: removedMeta,
        chainRemoval,
    });

    return true;
}
