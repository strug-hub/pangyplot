// Adapter: fetch /pop for a bubble node in the simplify force simulation,
// deserialize the response, and splice child nodes/links into the sim.

import { state } from '../../simplify-state.js';
import { spliceBubbleNodes } from '../engines/force-engine.js';
import { getForceNodes } from './force-data.js';
import { deserializeNodes } from '../../../graph/data/records/deserializer/deserialize-nodes.js';
import { createNodeElements, createLinkElements } from '../../../graph/data/records/deserializer/deserializer-element.js';
import { detectIndelBubbles } from '../../../graph/data/records/deserializer/indel-detection.js';
import { LinkRecord } from '../../../graph/data/records/objects/link-record.js';
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

    // Deserialize nodes
    const records = deserializeNodes(apiData.nodes);
    const bubbleRecords = records.filter(r => r.type === 'bubble');
    detectIndelBubbles(apiData.links, bubbleRecords);

    const childNodes = [];
    const childLinks = [];
    const recordMap = new Map();

    for (const record of records) {
        const els = createNodeElements(record);
        record.elements = els;
        recordMap.set(record.id, record);

        for (const node of els.nodes) {
            node.chainId = chainId;
            node.radius = node.width / 2;
            node.recordId = node.id;
            node.seqLength = record.seqLength;
            // Position children near the parent bubble
            node.x = bubbleNode.x + (Math.random() - 0.5) * 20;
            node.y = bubbleNode.y + (Math.random() - 0.5) * 20;
            childNodes.push(node);
        }

        for (const link of els.links) {
            link.chainId = chainId;
            link.isKinkLink = link.class === 'node';
            childLinks.push(link);
        }
    }

    // Deserialize inter-node links
    for (const rawLink of apiData.links) {
        const sourceRecord = recordMap.get(rawLink.source);
        const targetRecord = recordMap.get(rawLink.target);
        if (!sourceRecord || !targetRecord) continue;
        const linkRecord = new LinkRecord(rawLink, sourceRecord, targetRecord);
        const els = createLinkElements(linkRecord);
        for (const link of els.links) {
            link.chainId = chainId;
            link.isKinkLink = false;
            childLinks.push(link);
        }
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

    // Track for undo
    if (!state._bubblePopStack) state._bubblePopStack = [];
    state._bubblePopStack.push({
        bubbleId,
        chainId,
        parentNode: bubbleNode,
        childIids: childNodes.map(n => n.iid),
    });

    return true;
}
