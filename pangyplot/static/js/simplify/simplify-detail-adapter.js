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
/**
 * Create inter-chain links from sibling connectors.
 * Each connector is [[x,y],[x,y]] where endpoints match chain polyline
 * start/end points.
 *
 * If both endpoints belong to popped chains, links their anchor nodes.
 * If only one endpoint is popped, creates a pinned phantom node at the
 * static chain's polyline endpoint and links the anchor to it.
 *
 * @param {Object[]} siblingConnectors  [[x1,y1],[x2,y2]] pairs from API
 * @param {Set} poppedChainIds          Currently popped chain IDs
 * @param {Object[]} chains             All chain metadata from detailData
 * @param {Object[]} forceNodes         Current simulation nodes
 * @returns {{ nodes: Object[], links: Object[] }}  Phantom nodes + link elements
 */
export function createInterChainLinks(siblingConnectors, poppedChainIds, chains, forceNodes) {
    if (!siblingConnectors || siblingConnectors.length === 0) return { nodes: [], links: [] };

    // 1. Build coord→anchor map from popped chains' force nodes
    const coordToAnchor = new Map();
    for (const node of forceNodes) {
        if (!node.isAnchor || !node.anchorRecord || node.fx == null) continue;
        if (!poppedChainIds.has(node.chainId)) continue;
        const key = `${Math.round(node.fx)},${Math.round(node.fy)}`;
        coordToAnchor.set(key, { node, record: node.anchorRecord });
    }

    if (coordToAnchor.size === 0) return { nodes: [], links: [] };

    // 2. For each connector, create a link if at least one side is popped
    const nodes = [];
    const links = [];
    const seen = new Set();
    const phantomCache = new Map(); // coord key → phantom node

    function getOrCreatePhantom(coord) {
        const key = `${Math.round(coord[0])},${Math.round(coord[1])}`;
        if (phantomCache.has(key)) return phantomCache.get(key);
        const phantom = {
            id: `phantom_${key}`,
            x: coord[0], y: coord[1],
            fx: coord[0], fy: coord[1],
            chainId: '__interchain__',
            isPhantom: true,
            radius: 0,
            width: 0,
        };
        phantomCache.set(key, phantom);
        nodes.push(phantom);
        return phantom;
    }

    for (const [coordA, coordB] of siblingConnectors) {
        const keyA = `${Math.round(coordA[0])},${Math.round(coordA[1])}`;
        const keyB = `${Math.round(coordB[0])},${Math.round(coordB[1])}`;

        const anchorA = coordToAnchor.get(keyA);
        const anchorB = coordToAnchor.get(keyB);

        // Need at least one popped anchor
        if (!anchorA && !anchorB) continue;

        // Resolve each side to either its anchor node or a phantom
        const nodeA = anchorA ? anchorA.node : getOrCreatePhantom(coordA);
        const nodeB = anchorB ? anchorB.node : getOrCreatePhantom(coordB);
        if (nodeA === nodeB) continue;

        const pairKey = `${nodeA.id}↔${nodeB.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        seen.add(`${nodeB.id}↔${nodeA.id}`);

        // Simple D3-compatible link (no LinkRecord needed for cross-chain wires)
        links.push({
            source: nodeA,
            target: nodeB,
            isInterChain: true,
            isKinkLink: false,
            chainId: null,
        });
    }

    return { nodes, links };
}

/**
 * Deserialize junction segments into force-ready nodes and links.
 * Filters junctionGraph to only the requested segment IDs.
 *
 * @param {{ nodes: Object[], links: Object[] }} junctionGraph  Full junction graph from API
 * @param {string[]} segIds  Segment IDs to activate (e.g. "s123")
 * @returns {{ nodes: Object[], links: Object[] }}  D3 force-ready elements
 */
export function deserializeJunctionSegments(junctionGraph, segIds) {
    const segIdSet = new Set(segIds);

    // Filter nodes to only requested segments
    const filteredNodes = junctionGraph.nodes.filter(
        n => segIdSet.has(n.id || `s${n.segment_id}`));

    if (filteredNodes.length === 0) return { nodes: [], links: [] };

    const records = deserializeNodes(filteredNodes);
    const allNodes = [];
    const allLinks = [];
    const recordMap = new Map();

    for (const record of records) {
        const els = createNodeElements(record);
        record.elements = els;
        recordMap.set(record.id, record);

        for (const node of els.nodes) {
            node.chainId = 'junction';
            node.radius = node.width / 2;
            node.recordId = node.id;
            node.seqLength = record.seqLength;
            allNodes.push(node);
        }
        for (const link of els.links) {
            link.chainId = 'junction';
            link.isKinkLink = link.class === 'node';
            allLinks.push(link);
        }
    }

    // Create inter-segment links within the junction graph
    const filteredLinks = junctionGraph.links.filter(l => {
        const sId = typeof l.source === 'string' ? l.source : `s${l.source}`;
        const tId = typeof l.target === 'string' ? l.target : `s${l.target}`;
        return recordMap.has(sId) && recordMap.has(tId);
    });

    for (const rawLink of filteredLinks) {
        const sId = typeof rawLink.source === 'string' ? rawLink.source : `s${rawLink.source}`;
        const tId = typeof rawLink.target === 'string' ? rawLink.target : `s${rawLink.target}`;
        const sourceRecord = recordMap.get(sId);
        const targetRecord = recordMap.get(tId);
        if (!sourceRecord || !targetRecord) continue;

        const linkRecord = new LinkRecord(rawLink, sourceRecord, targetRecord);
        const els = createLinkElements(linkRecord);
        for (const link of els.links) {
            link.chainId = 'junction';
            link.isKinkLink = false;
            allLinks.push(link);
        }
    }

    return { nodes: allNodes, links: allLinks, recordMap };
}

/**
 * Create force links connecting junction nodes to chain anchor nodes.
 * Mirrors core's deserializeLinks resolution pattern:
 *   segToRecord.get(segId) || recordMap.get("s" + segId)
 * where segToRecord maps chain boundary seg IDs → anchor records,
 * and recordMap holds junction node records.
 *
 * @param {Map<string, Object>} junctionRecordMap  Junction node records by ID (from deserializeJunctionSegments)
 * @param {Object[]} allForceNodes  All simulation nodes (to find anchor nodes)
 * @param {{ nodes: Object[], links: Object[] }} junctionGraph  Raw junction graph from API
 * @param {Object[]} poppedChains  Chain metadata [{id, sourceSegs, sinkSegs}, ...]
 * @returns {Object[]}  Link elements connecting junctions to anchors
 */
export function createJunctionToAnchorLinks(junctionRecordMap, allForceNodes, junctionGraph, poppedChains) {
    if (junctionRecordMap.size === 0) return [];

    // 1. Build segToRecord: chain boundary seg IDs → anchor node's record
    //    (analogous to core's viewState.segmentToNode)
    const segToRecord = new Map();
    for (const node of allForceNodes) {
        if (!node.isAnchor || !node.anchorRecord) continue;
        const chainMeta = poppedChains.find(c => c.id === node.chainId);
        if (!chainMeta) continue;

        if (node.anchorRole === 'source' || node.anchorRole === 'source+sink') {
            if (chainMeta.sourceSegs) {
                for (const seg of chainMeta.sourceSegs) {
                    segToRecord.set(String(seg), node.anchorRecord);
                }
            }
        }
        if (node.anchorRole === 'sink' || node.anchorRole === 'source+sink') {
            if (chainMeta.sinkSegs) {
                for (const seg of chainMeta.sinkSegs) {
                    segToRecord.set(String(seg), node.anchorRecord);
                }
            }
        }
    }

    if (segToRecord.size === 0) return [];

    // 2. Resolve junction graph links
    const links = [];
    const seen = new Set();

    function pushLink(sourceRecord, targetRecord, rawLink) {
        if (!sourceRecord || !targetRecord) return;
        if (sourceRecord === targetRecord) return;
        const pairKey = `${sourceRecord.id}→${targetRecord.id}`;
        if (seen.has(pairKey)) return;
        seen.add(pairKey);

        const resolvedLink = {
            ...rawLink,
            id: `junc_${sourceRecord.id}_${targetRecord.id}`,
            source: sourceRecord.id,
            target: targetRecord.id,
        };
        const linkRecord = new LinkRecord(resolvedLink, sourceRecord, targetRecord);
        const els = createLinkElements(linkRecord);
        for (const link of els.links) {
            link.chainId = 'junction';
            link.isKinkLink = false;
            link.isJunctionLink = true;
            links.push(link);
        }
    }

    for (const rawLink of junctionGraph.links) {
        const srcSegId = typeof rawLink.source === 'string'
            ? rawLink.source.replace(/^s/, '') : String(rawLink.source);
        const tgtSegId = typeof rawLink.target === 'string'
            ? rawLink.target.replace(/^s/, '') : String(rawLink.target);

        const srcIsJunction = junctionRecordMap.has('s' + srcSegId);
        const tgtIsJunction = junctionRecordMap.has('s' + tgtSegId);

        // At least one endpoint must be a junction segment
        if (!srcIsJunction && !tgtIsJunction) continue;

        // Junction records take priority: if a seg is an active junction node,
        // resolve to it (not the chain anchor it also serves as boundary for)
        const sourceRecord = junctionRecordMap.get('s' + srcSegId) || segToRecord.get(srcSegId);
        const targetRecord = junctionRecordMap.get('s' + tgtSegId) || segToRecord.get(tgtSegId);

        pushLink(sourceRecord, targetRecord, rawLink);
    }

    // 3. Direct junction↔anchor links: when a junction node's seg ID
    //    is also a chain boundary seg, create a link from the junction
    //    record to the chain's anchor record.  This handles cases where
    //    GFA links go through bubble-internal segs (e.g. s137186→s137188
    //    where s137186 is inside b7969 and unresolvable, but s137188 is
    //    both a junction node and c122.1's source boundary seg).
    for (const [juncId, juncRecord] of junctionRecordMap) {
        const segId = juncId.replace(/^s/, '');
        const anchorRecord = segToRecord.get(segId);
        if (!anchorRecord) continue;
        pushLink(juncRecord, anchorRecord, {
            source: juncId,
            target: `anchor_${segId}`,
            from_strand: '+',
            to_strand: '+',
        });
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

    // Use first and last records (ordered by chain step from the API)
    // rather than distance-based matching, which fails when bubble layout
    // positions diverge from the chain polyline's segment centroids.
    const recIds = [...nodesByRecord.keys()];
    const firstRec = recIds[0];
    const lastRec = recIds[recIds.length - 1];

    if (firstRec) {
        const head = nodesByRecord.get(firstRec)[0];
        head.fx = plStart[0];
        head.fy = plStart[1];
        head.isAnchor = true;
        head.anchorRole = 'source';
        head.anchorRecord = head.record;
    }
    if (lastRec) {
        const kinks = nodesByRecord.get(lastRec);
        const tail = kinks[kinks.length - 1];
        if (lastRec !== firstRec || kinks.length > 1) {
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
