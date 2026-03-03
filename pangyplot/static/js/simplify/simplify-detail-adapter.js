// Adapter: converts /chain-graph API responses into core PangyPlot elements
// for use in the simplify detail force simulation.

import { deserializeNodes } from '../graph/data/records/deserializer/deserialize-nodes.js';
import { createNodeElements, createLinkElements } from '../graph/data/records/deserializer/deserializer-element.js';
import { detectIndelBubbles } from '../graph/data/records/deserializer/indel-detection.js';
import { LinkRecord } from '../graph/data/records/objects/link-record.js';

/**
 * Convert a /chain-graph API response into augmented core elements
 * suitable for the simplify force simulation.
 *
 * @param {{ nodes: Object[], links: Object[] }} apiData  Raw API response
 * @param {{ id: string, polyline: number[][] }}  chain   Chain metadata
 * @returns {{ nodes: Object[], links: Object[] }}  D3 force-ready elements
 */
export function deserializeChainGraph(apiData, chain) {
    const records = deserializeNodes(apiData.nodes);

    // Mark indel bubbles (affects deletion link creation in createNodeElements)
    const bubbleRecords = records.filter(r => r.type === 'bubble');
    detectIndelBubbles(apiData.links, bubbleRecords);

    const allNodes = [];
    const allLinks = [];
    const recordMap = new Map();

    // Create kink elements for each record
    for (const record of records) {
        const els = createNodeElements(record);
        record.elements = els;
        recordMap.set(record.id, record);

        for (const node of els.nodes) {
            node.chainId = chain.id;
            node.radius = node.width / 2;
            node.recordId = node.id;
            node.seqLength = record.seqLength;
            allNodes.push(node);
        }

        for (const link of els.links) {
            link.chainId = chain.id;
            link.isKinkLink = link.class === 'node';
            allLinks.push(link);
        }
    }

    // Create inter-record link elements (strand-aware head/tail connection)
    for (const rawLink of apiData.links) {
        const sourceRecord = recordMap.get(rawLink.source);
        const targetRecord = recordMap.get(rawLink.target);
        const linkRecord = new LinkRecord(rawLink, sourceRecord, targetRecord);

        const els = createLinkElements(linkRecord);
        for (const link of els.links) {
            link.chainId = chain.id;
            link.isKinkLink = false;
            allLinks.push(link);
        }
    }

    // Anchor pinning: fix head/tail kinks closest to chain polyline endpoints
    if (chain.polyline.length >= 2 && allNodes.length > 0) {
        pinAnchors(allNodes, chain.polyline);
    }

    return { nodes: allNodes, links: allLinks };
}

function pinAnchors(nodes, polyline) {
    const plStart = polyline[0];
    const plEnd = polyline[polyline.length - 1];

    // Group nodes by record ID (all kinks of a record share node.id)
    const nodesByRecord = new Map();
    for (const node of nodes) {
        if (!nodesByRecord.has(node.id)) nodesByRecord.set(node.id, []);
        nodesByRecord.get(node.id).push(node);
    }

    let closestStartRec = null, startDist = Infinity;
    let closestEndRec = null, endDist = Infinity;

    for (const [recId, kinks] of nodesByRecord) {
        const head = kinks[0];
        const tail = kinks[kinks.length - 1];
        const ds = Math.hypot(head.x - plStart[0], head.y - plStart[1]);
        const de = Math.hypot(tail.x - plEnd[0], tail.y - plEnd[1]);
        if (ds < startDist) { startDist = ds; closestStartRec = recId; }
        if (de < endDist) { endDist = de; closestEndRec = recId; }
    }

    if (closestStartRec) {
        const head = nodesByRecord.get(closestStartRec)[0];
        head.fx = plStart[0];
        head.fy = plStart[1];
        head.isAnchor = true;
    }
    if (closestEndRec && closestEndRec !== closestStartRec) {
        const kinks = nodesByRecord.get(closestEndRec);
        const tail = kinks[kinks.length - 1];
        tail.fx = plEnd[0];
        tail.fy = plEnd[1];
        tail.isAnchor = true;
    }
}
