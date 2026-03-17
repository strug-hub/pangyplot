// Adapter: fetch /pop for a bubble node in the simplify force simulation,
// deserialize the response, and splice child nodes/links into the sim.

import { state } from '../../simplify-state.js';
import { spliceBubbleNodes } from '../engines/force-engine.js';
import { getForceNodes } from './force-data.js';
import { deserializeSubgraph } from '../../../graph/data/records/deserializer/deserialize-subgraph.js';
import simplifyViewState from './simplify-view-state.js';
import { recordPop } from '../../../utils/pop-history.js';

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

    // Deserialize subgraph with viewState-aware link resolution
    const { nodes: childNodes, links: childLinks, recordMap } = deserializeSubgraph(apiData, {
        tag: { chainId },
        linkResolver: (segId) => {
            // Strip "s" prefix for viewState lookup
            const plainId = segId.startsWith('s') ? segId.slice(1) : segId;
            return simplifyViewState.resolve(plainId);
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

    // Position children near the parent bubble
    for (const node of childNodes) {
        node.x = bubbleNode.x + (Math.random() - 0.5) * 20;
        node.y = bubbleNode.y + (Math.random() - 0.5) * 20;
    }

    if (childNodes.length === 0) return false;

    // Collect iids of the parent bubble's kink nodes
    const parentIids = new Set();
    for (const n of getForceNodes()) {
        if (n.id === bubbleId) parentIids.add(n.iid);
    }

    // Build rewire map: parent kink endpoints → child boundary endpoints
    const rewireMap = new Map();
    if (apiData.source_segs && apiData.sink_segs) {
        const sourceSegIds = new Set(apiData.source_segs.map(s => `s${s}`));
        const sinkSegIds = new Set(apiData.sink_segs.map(s => `s${s}`));

        for (const node of childNodes) {
            if (sourceSegIds.has(node.id) && node.idx === 0) {
                const parentHead = `${bubbleId}#0`;
                if (!rewireMap.has(parentHead)) rewireMap.set(parentHead, node.iid);
            }
            if (sinkSegIds.has(node.id) && node.idx === (node.kinks || 1) - 1) {
                const parentKinks = bubbleNode.kinks || 1;
                const parentTail = `${bubbleId}#${parentKinks - 1}`;
                if (!rewireMap.has(parentTail)) rewireMap.set(parentTail, node.iid);
            }
        }
    }

    // Atomic splice: remove parent, rewire links, add children
    spliceBubbleNodes(parentIids, rewireMap, childNodes, childLinks);
    recordPop('bubble-pop', { id: bubbleId, chain: chainId });

    // Track for undo — capture enough state to reverse the pop
    if (!state._bubblePopStack) state._bubblePopStack = [];
    state._bubblePopStack.push({
        bubbleId,
        chainId,
        parentRecord: parentRecord,
        parentKinks: bubbleNode.kinks || 1,
        parentNode: bubbleNode,
        childIids: childNodes.map(n => n.iid),
        childLinks: childLinks,
        rewireMap,
        sourceSegs: apiData.source_segs || [],
        sinkSegs: apiData.sink_segs || [],
        childBubbles: apiData.child_bubbles || [],
        insideSegs,
    });

    return true;
}
