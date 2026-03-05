// Adapter: converts /chain-graph API responses into core PangyPlot elements
// for use in the simplify detail force simulation.

import { deserializeNodes } from '../../graph/data/records/deserializer/deserialize-nodes.js';
import { createNodeElements, createLinkElements } from '../../graph/data/records/deserializer/deserializer-element.js';
import { detectIndelBubbles } from '../../graph/data/records/deserializer/indel-detection.js';
import { LinkRecord } from '../../graph/data/records/objects/link-record.js';

/**
 * Clip a polyline to a fractional [tStart, tEnd] range along its arc length.
 */
function clipPolylineByTRange(polyline, tStart, tEnd) {
    if (polyline.length < 2) return polyline;

    const cumLen = [0];
    for (let i = 1; i < polyline.length; i++) {
        const dx = polyline[i][0] - polyline[i - 1][0];
        const dy = polyline[i][1] - polyline[i - 1][1];
        cumLen.push(cumLen[i - 1] + Math.hypot(dx, dy));
    }
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return polyline;

    const sStart = Math.max(0, tStart) * totalLen;
    const sEnd = Math.min(1, tEnd) * totalLen;

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
 */
export function deserializeChainGraph(apiData, chain, clipRange) {
    const records = deserializeNodes(apiData.nodes);

    const bubbleRecords = records.filter(r => r.type === 'bubble');
    detectIndelBubbles(apiData.links, bubbleRecords);

    const allNodes = [];
    const allLinks = [];
    const recordMap = new Map();

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

    if (chain.polyline.length >= 2 && allNodes.length > 0) {
        const pinSource = !clipRange || clipRange.tStart === 0;
        const pinSink = !clipRange || clipRange.tEnd === 1;
        pinAnchors(allNodes, chain.polyline, pinSource, pinSink);
    }

    return { nodes: allNodes, links: allLinks };
}

/**
 * Create inter-chain links from sibling connectors.
 */
export function createInterChainLinks(siblingConnectors, poppedChainIds, chains, forceNodes) {
    if (!siblingConnectors || siblingConnectors.length === 0) return { nodes: [], links: [] };

    const coordToAnchor = new Map();
    for (const node of forceNodes) {
        if (!node.isAnchor || !node.anchorRecord || node.fx == null) continue;
        if (!poppedChainIds.has(node.chainId)) continue;
        const key = `${Math.round(node.fx)},${Math.round(node.fy)}`;
        coordToAnchor.set(key, { node, record: node.anchorRecord });
    }

    if (coordToAnchor.size === 0) return { nodes: [], links: [] };

    const nodes = [];
    const links = [];
    const seen = new Set();
    const phantomCache = new Map();

    function getOrCreatePhantom(coord) {
        const key = `${Math.round(coord[0])},${Math.round(coord[1])}`;
        if (phantomCache.has(key)) return phantomCache.get(key);
        const phantom = {
            id: `phantom_${key}`,
            iid: `phantom_${key}`,
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

        if (!anchorA && !anchorB) continue;

        const nodeA = anchorA ? anchorA.node : getOrCreatePhantom(coordA);
        const nodeB = anchorB ? anchorB.node : getOrCreatePhantom(coordB);
        if (nodeA === nodeB) continue;

        const pairKey = `${nodeA.id}↔${nodeB.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        seen.add(`${nodeB.id}↔${nodeA.id}`);

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
 */
export function deserializeJunctionSegments(junctionGraph, segIds) {
    const segIdSet = new Set(segIds);

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
 */
export function createJunctionToAnchorLinks(junctionRecordMap, allForceNodes, junctionGraph, poppedChains) {
    if (junctionRecordMap.size === 0) return [];

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

        if (!srcIsJunction && !tgtIsJunction) continue;

        const sourceRecord = junctionRecordMap.get('s' + srcSegId) || segToRecord.get(srcSegId);
        const targetRecord = junctionRecordMap.get('s' + tgtSegId) || segToRecord.get(tgtSegId);

        pushLink(sourceRecord, targetRecord, rawLink);
    }

    // Tether junction nodes to their matching chain anchor when they
    // represent the same physical segment.  Create direct kink-to-kink
    // links (head→head, tail→tail) instead of strand-resolved links.
    for (const [juncId, juncRecord] of junctionRecordMap) {
        const segId = juncId.replace(/^s/, '');
        const anchorRecord = segToRecord.get(segId);
        if (!anchorRecord) continue;
        if (!juncRecord.elements || !anchorRecord.elements) continue;
        const juncNodes = juncRecord.elements.nodes;
        const anchorNodes = anchorRecord.elements.nodes;
        if (!juncNodes.length || !anchorNodes.length) continue;

        // Head-to-head tether
        const jHead = juncNodes[0];
        const aHead = anchorNodes[0];
        const headKey = `${jHead.iid}→${aHead.iid}`;
        if (!seen.has(headKey)) {
            seen.add(headKey);
            links.push({
                source: jHead.iid,
                target: aHead.iid,
                sourceIid: jHead.iid,
                targetIid: aHead.iid,
                chainId: 'junction',
                isKinkLink: false,
                isJunctionLink: true,
                length: 1,
            });
        }

        // Tail-to-tail tether (if multi-kink)
        if (juncNodes.length > 1 && anchorNodes.length > 1) {
            const jTail = juncNodes[juncNodes.length - 1];
            const aTail = anchorNodes[anchorNodes.length - 1];
            const tailKey = `${jTail.iid}→${aTail.iid}`;
            if (!seen.has(tailKey)) {
                seen.add(tailKey);
                links.push({
                    source: jTail.iid,
                    target: aTail.iid,
                    sourceIid: jTail.iid,
                    targetIid: aTail.iid,
                    chainId: 'junction',
                    isKinkLink: false,
                    isJunctionLink: true,
                    length: 1,
                });
            }
        }
    }

    return links;
}

function pinAnchors(nodes, polyline, pinSource = true, pinSink = true) {
    const plStart = polyline[0];
    const plEnd = polyline[polyline.length - 1];

    const nodesByRecord = new Map();
    for (const node of nodes) {
        if (!nodesByRecord.has(node.id)) nodesByRecord.set(node.id, []);
        nodesByRecord.get(node.id).push(node);
    }

    const recIds = [...nodesByRecord.keys()];
    const firstRec = recIds[0];
    const lastRec = recIds[recIds.length - 1];

    if (firstRec && pinSource) {
        const head = nodesByRecord.get(firstRec)[0];
        head.fx = plStart[0];
        head.fy = plStart[1];
        head.isAnchor = true;
        head.anchorRole = 'source';
        head.anchorRecord = head.record;
    }
    if (lastRec && pinSink) {
        const kinks = nodesByRecord.get(lastRec);
        const tail = kinks[kinks.length - 1];
        if (lastRec !== firstRec || kinks.length > 1) {
            tail.fx = plEnd[0];
            tail.fy = plEnd[1];
            tail.isAnchor = true;
            tail.anchorRole = 'sink';
            tail.anchorRecord = tail.record;
        } else if (pinSource) {
            tail.anchorRole = 'source+sink';
        }
    }
}
