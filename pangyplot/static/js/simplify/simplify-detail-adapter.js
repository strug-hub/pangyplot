// Adapter: converts /chain-graph API responses into core PangyPlot elements
// for use in the simplify detail force simulation.

import { deserializeNodes } from '../graph/data/records/deserializer/deserialize-nodes.js';
import { createNodeElements, createLinkElements } from '../graph/data/records/deserializer/deserializer-element.js';
import { detectIndelBubbles } from '../graph/data/records/deserializer/indel-detection.js';
import { LinkRecord } from '../graph/data/records/objects/link-record.js';

/**
 * Clip a polyline to a fractional [tStart, tEnd] range along its arc length.
 * Returns a sub-polyline with interpolated endpoints.
 *
 * @param {number[][]} polyline  Array of [x, y] points
 * @param {number} tStart        Fractional start (0–1)
 * @param {number} tEnd          Fractional end (0–1)
 * @returns {number[][]}         Clipped sub-polyline
 */
function clipPolylineByTRange(polyline, tStart, tEnd) {
    if (polyline.length < 2) return polyline;

    // Compute cumulative arc lengths
    const cumLen = [0];
    for (let i = 1; i < polyline.length; i++) {
        const dx = polyline[i][0] - polyline[i - 1][0];
        const dy = polyline[i][1] - polyline[i - 1][1];
        cumLen.push(cumLen[i - 1] + Math.hypot(dx, dy));
    }
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return polyline;

    // Clamp t values
    const sStart = Math.max(0, tStart) * totalLen;
    const sEnd = Math.min(1, tEnd) * totalLen;

    // Interpolate a point at arc-length distance s
    function interpAt(s) {
        for (let i = 1; i < cumLen.length; i++) {
            if (s <= cumLen[i]) {
                const segLen = cumLen[i] - cumLen[i - 1];
                const f = segLen > 0 ? (s - cumLen[i - 1]) / segLen : 0;
                return [
                    polyline[i - 1][0] + f * (polyline[i][0] - polyline[i - 1][0]),
                    polyline[i - 1][1] + f * (polyline[i][1] - polyline[i - 1][1]),
                ];
            }
        }
        return polyline[polyline.length - 1];
    }

    const result = [interpAt(sStart)];

    // Add interior points between sStart and sEnd
    for (let i = 1; i < polyline.length - 1; i++) {
        if (cumLen[i] > sStart && cumLen[i] < sEnd) {
            result.push(polyline[i]);
        }
    }

    result.push(interpAt(sEnd));
    return result;
}

/**
 * Convert a /chain-graph API response into augmented core elements
 * suitable for the simplify force simulation.
 *
 * @param {{ nodes: Object[], links: Object[] }} apiData  Raw API response
 * @param {{ id: string, polyline: number[][] }}  chain   Chain metadata
 * @param {{ tStart: number, tEnd: number }|null} clipRange  Optional clip range for partial chains
 * @returns {{ nodes: Object[], links: Object[] }}  D3 force-ready elements
 */
export function deserializeChainGraph(apiData, chain, clipRange) {
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
    // When partially fetched, clip the polyline to match the fetched range
    let anchorPolyline = chain.polyline;
    if (clipRange && chain.polyline.length >= 2) {
        anchorPolyline = clipPolylineByTRange(chain.polyline, clipRange.tStart, clipRange.tEnd);
    }
    if (anchorPolyline.length >= 2 && allNodes.length > 0) {
        pinAnchors(allNodes, anchorPolyline);
    }

    return { nodes: allNodes, links: allLinks };
}

/**
 * Create inter-chain links between adjacent popped chains.
 * Uses the core LinkRecord + createLinkElements pipeline so inter-chain
 * connections go through the same strand-aware head/tail logic as all links.
 *
 * @param {Object[]} poppedChains  Chain metadata objects (with sourceSegs, sinkSegs)
 * @param {Object[]} forceNodes    Current simulation nodes
 * @returns {Object[]}             Link elements tagged with isInterChain: true
 */
export function createInterChainLinks(poppedChains, forceNodes) {
    // 1. Build anchor index: chainId → { source: { node, record }, sink: { node, record } }
    const anchorIndex = new Map();
    for (const node of forceNodes) {
        if (!node.isAnchor || !node.anchorRole) continue;
        const chainId = node.chainId;
        if (!anchorIndex.has(chainId)) anchorIndex.set(chainId, {});
        const entry = anchorIndex.get(chainId);

        if (node.anchorRole === 'source' || node.anchorRole === 'source+sink') {
            entry.source = { node, record: node.anchorRecord };
        }
        if (node.anchorRole === 'sink' || node.anchorRole === 'source+sink') {
            entry.sink = { node, record: node.anchorRecord };
        }
    }

    // 2. Build segment-to-chain map from sourceSegs of popped chains
    const sourceSegToChain = new Map();
    for (const chain of poppedChains) {
        if (!chain.sourceSegs) continue;
        for (const seg of chain.sourceSegs) {
            if (!sourceSegToChain.has(seg)) sourceSegToChain.set(seg, []);
            sourceSegToChain.get(seg).push(chain.id);
        }
    }

    // 3. For each chain's sinkSegs, find chains whose sourceSegs overlap
    const links = [];
    const seen = new Set();

    for (const chain of poppedChains) {
        if (!chain.sinkSegs) continue;
        const sinkAnchor = anchorIndex.get(chain.id)?.sink;
        if (!sinkAnchor) continue;

        for (const seg of chain.sinkSegs) {
            const adjacentChains = sourceSegToChain.get(seg);
            if (!adjacentChains) continue;

            for (const adjId of adjacentChains) {
                if (adjId === chain.id) continue;

                // Deduplicate: one link per directed pair
                const pairKey = `${chain.id}→${adjId}`;
                if (seen.has(pairKey)) continue;
                seen.add(pairKey);

                const sourceAnchor = anchorIndex.get(adjId)?.source;
                if (!sourceAnchor) continue;

                // 4. Create synthetic rawLink + LinkRecord
                const rawLink = {
                    id: `interchain_${chain.id}_${adjId}`,
                    source: sinkAnchor.record.id,
                    target: sourceAnchor.record.id,
                    from_strand: '+',
                    to_strand: '+',
                };
                const linkRecord = new LinkRecord(rawLink, sinkAnchor.record, sourceAnchor.record);

                // 5. Create link elements via core pipeline
                const els = createLinkElements(linkRecord);

                // 6. Tag as inter-chain
                for (const link of els.links) {
                    link.isInterChain = true;
                    link.chainId = null;
                    link.isKinkLink = false;
                    links.push(link);
                }
            }
        }
    }

    return links;
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
        head.anchorRole = 'source';
        head.anchorRecord = head.record;
    }
    if (closestEndRec) {
        const kinks = nodesByRecord.get(closestEndRec);
        const tail = kinks[kinks.length - 1];
        if (closestEndRec !== closestStartRec || kinks.length > 1) {
            tail.fx = plEnd[0];
            tail.fy = plEnd[1];
            tail.isAnchor = true;
            tail.anchorRole = 'sink';
            tail.anchorRecord = tail.record;
        } else {
            // Single-kink single-record chain: same node serves both roles
            tail.anchorRole = 'source+sink';
        }
    }
}
