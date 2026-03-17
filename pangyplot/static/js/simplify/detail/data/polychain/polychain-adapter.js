// Adapter: converts /chain-graph API responses into core PangyPlot elements
// for use in the simplify detail force simulation.

import { deserializeSubgraph } from '../../../../graph/data/records/deserializer/deserialize-subgraph.js';
import simplifyViewState from '../simplify-view-state.js';
import { getForceNodes } from '../force-data.js';

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
export function createInterChainLinks(junctionLinks, poppedChainIds, chains, forceNodes, junctionSegChains) {
    if (!junctionLinks || junctionLinks.length === 0) return { nodes: [], links: [] };

    const coordToAnchor = new Map();
    for (const node of forceNodes) {
        if (!node.isAnchor || !node.anchorRecord) continue;
        // Include unanchored-for-junction nodes by checking saved position
        const posX = node.fx ?? node._savedFx;
        const posY = node.fy ?? node._savedFy;
        if (posX == null) continue;
        if (!poppedChainIds.has(node.chainId)) continue;
        const key = `${Math.round(posX)},${Math.round(posY)}`;
        coordToAnchor.set(key, { node, record: node.anchorRecord });
    }

    if (coordToAnchor.size === 0) return { nodes: [], links: [] };

    // Build set of fully-popped junction links to skip (handled by junction nodes)
    const segChains = junctionSegChains || {};
    const skipJunctions = new Set();
    for (let i = 0; i < junctionLinks.length; i++) {
        const jl = junctionLinks[i];
        const chainsA = segChains[`s${jl.segs[0]}`] || [];
        const chainsB = segChains[`s${jl.segs[1]}`] || [];
        if (chainsA.length > 0 && chainsB.length > 0 &&
            chainsA.every(c => poppedChainIds.has(c)) &&
            chainsB.every(c => poppedChainIds.has(c))) {
            skipJunctions.add(i);
        }
    }

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

    for (let i = 0; i < junctionLinks.length; i++) {
        if (skipJunctions.has(i)) continue; // handled by junction nodes
        const jl = junctionLinks[i];
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

/**
 * Create cross-chain b→b (or b→s, s→s) links for fully-popped junction links.
 * Resolves endpoint segment IDs via simplifyViewState and existing force records
 * to find the bubble/segment nodes, then creates D3 links between their kink endpoints.
 */
export function createCrossChainLinks(fullyPoppedJunctions) {
    if (fullyPoppedJunctions.length === 0) return [];

    // Build existing record lookup from force nodes
    const existingRecords = new Map();
    for (const n of getForceNodes()) {
        if (n.record && !existingRecords.has(n.id)) {
            existingRecords.set(n.id, n.record);
        }
    }

    function resolveSegToRecord(segId) {
        const plainId = String(segId);
        const sId = `s${plainId}`;
        return simplifyViewState.resolve(plainId) || existingRecords.get(sId) || null;
    }

    const links = [];
    const seen = new Set();

    for (const jl of fullyPoppedJunctions) {
        const recA = resolveSegToRecord(jl.segs[0]);
        const recB = resolveSegToRecord(jl.segs[1]);
        if (!recA || !recB || recA === recB) continue;

        const pairKey = `${recA.id}↔${recB.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        seen.add(`${recB.id}↔${recA.id}`);

        // Connect tail of recA to head of recB (+ strand default)
        if (!recA.elements?.nodes?.[0] || !recB.elements?.nodes?.[0]) continue;
        const sourceIid = recA.elements.nodes[0].tail();
        const targetIid = recB.elements.nodes[0].head();

        links.push({
            isNode: false,
            isLink: true,
            class: 'link',
            iid: `xchain_${sourceIid}+${targetIid}+`,
            type: 'link',
            source: sourceIid,
            target: targetIid,
            sourceIid: sourceIid,
            targetIid: targetIid,
            sourceId: recA.id,
            targetId: recB.id,
            isInterChain: true,
            isKinkLink: false,
            isDrawn: true,
            length: 10,
            width: 3,
            chainId: null,
        });
    }
    return links;
}

/**
 * Build a lookup from segment ID → chain IDs, combining junctionSegChains
 * (naked segments) with chain source/sink seg ownership (endpoint segments).
 */
export function buildSegToChains(junctionSegChains, chains) {
    const map = {};
    // Copy naked seg → chain mappings
    for (const [key, val] of Object.entries(junctionSegChains)) {
        map[key] = val;
    }
    // Add chain endpoint segs (source/sink) — these aren't in junctionSegChains
    for (const chain of chains) {
        for (const sid of (chain.sourceSegs || [])) {
            const key = `s${sid}`;
            if (!map[key]) map[key] = [];
            if (!map[key].includes(chain.id)) map[key].push(chain.id);
        }
        for (const sid of (chain.sinkSegs || [])) {
            const key = `s${sid}`;
            if (!map[key]) map[key] = [];
            if (!map[key].includes(chain.id)) map[key].push(chain.id);
        }
    }
    return map;
}

/**
 * Identify junction links where both endpoint segments' chains are all popped.
 */
export function getFullyPoppedJunctionLinks(junctionLinks, segToChains, poppedChainIds) {
    if (!junctionLinks || poppedChainIds.size === 0) return [];
    const result = [];
    for (const jl of junctionLinks) {
        const chainsA = segToChains[`s${jl.segs[0]}`] || [];
        const chainsB = segToChains[`s${jl.segs[1]}`] || [];
        if (chainsA.length > 0 && chainsB.length > 0 &&
            chainsA.every(c => poppedChainIds.has(c)) &&
            chainsB.every(c => poppedChainIds.has(c))) {
            result.push(jl);
        }
    }
    return result;
}

/**
 * Create force nodes/links for naked junction segments that sit between
 * two fully-popped chains, replacing the static junction lines.
 * Uses linkResolver to connect junction segments to adjacent bubble nodes
 * in popped chains via GFA links (same pattern as bubble-pop-adapter).
 */
export function createJunctionNodes(junctionGraph, fullyPoppedJunctions, forceNodes) {
    if (fullyPoppedJunctions.length === 0 || !junctionGraph) return { nodes: [], links: [] };

    // Collect segment IDs involved in fully-popped junction links
    const neededSegIds = new Set();
    for (const jl of fullyPoppedJunctions) {
        neededSegIds.add(`s${jl.segs[0]}`);
        neededSegIds.add(`s${jl.segs[1]}`);
    }

    // Filter junction graph to only needed segments
    const filteredNodes = junctionGraph.nodes.filter(n => neededSegIds.has(n.id));
    if (filteredNodes.length === 0) return { nodes: [], links: [] };

    const nodeIdSet = new Set(filteredNodes.map(n => n.id));
    // Keep all links where at least one end is a junction node —
    // cross-boundary links to chain segments will be resolved via linkResolver
    const filteredLinks = junctionGraph.links.filter(
        l => nodeIdSet.has(l.source) || nodeIdSet.has(l.target)
    );

    // Build existing record lookup from force nodes (for cross-boundary resolution)
    const existingRecords = new Map();
    for (const n of forceNodes) {
        if (n.record && !existingRecords.has(n.id)) {
            existingRecords.set(n.id, n.record);
        }
    }

    const apiData = { nodes: filteredNodes, links: filteredLinks };
    const { nodes, links } = deserializeSubgraph(apiData, {
        tag: { chainId: '__junction__' },
        detectIndels: false,
        linkResolver: (segId) => {
            const plainId = segId.startsWith('s') ? segId.slice(1) : segId;
            return simplifyViewState.resolve(plainId) || existingRecords.get(segId) || null;
        },
    });

    // Set initial positions from ODGI layout — no fx/fy (force-driven)
    const rawNodeMap = new Map(filteredNodes.map(n => [n.id, n]));
    for (const node of nodes) {
        const raw = rawNodeMap.get(node.id);
        if (raw) {
            const cx = (raw.x1 + raw.x2) / 2;
            const cy = (raw.y1 + raw.y2) / 2;
            node.x = cx;
            node.y = cy;
            delete node.fx;
            delete node.fy;
        }
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
