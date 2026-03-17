// Adapter: converts /chain-graph API responses into core PangyPlot elements
// for use in the simplify detail force simulation.

import { deserializeSubgraph } from '../../../../graph/data/records/deserializer/deserialize-subgraph.js';
import simplifyViewState from '../simplify-view-state.js';

/**
 * Convert a /chain-graph API response into augmented core elements
 * suitable for the simplify force simulation.
 */
export function deserializeChainGraph(apiData, chain, clipRange) {
    const { nodes: allNodes, links: allLinks, recordMap } = deserializeSubgraph(apiData, {
        tag: { chainId: chain.id },
    });

    // Register bubble segments in simplify viewState
    const rawNodeMap = new Map(apiData.nodes.map(n => [n.id, n]));
    for (const [id, record] of recordMap) {
        if (record.type !== 'bubble') continue;
        const rawNode = rawNodeMap.get(id);
        if (rawNode) {
            simplifyViewState.registerBubble(
                record,
                rawNode.source_segs || [],
                rawNode.sink_segs || [],
                rawNode.inside_segs || [],
            );
        }
    }

    if (chain.polyline.length >= 2 && allNodes.length > 0) {
        pinAnchors(allNodes, chain.polyline);
    }

    return { nodes: allNodes, links: allLinks };
}

/**
 * Create inter-chain links from junction link coordinates.
 */
export function createInterChainLinks(junctionLinks, poppedChainIds, chains, forceNodes) {
    if (!junctionLinks || junctionLinks.length === 0) return { nodes: [], links: [] };

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

    for (const jl of junctionLinks) {
        const [coordA, coordB] = jl.coords;
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

function pinAnchors(nodes, polyline) {
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
            tail.anchorRole = 'source+sink';
        }
    }
}
