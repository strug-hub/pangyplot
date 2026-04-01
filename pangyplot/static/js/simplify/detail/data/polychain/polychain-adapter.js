// Adapter: converts /detail-tiles API responses into polychain nodes
// for use in the simplify detail force simulation.
//
// POLYCHAIN PHYSICS EXPERIMENT:
// Each chain's polyline vertices become force nodes connected sequentially.
// Junction (naked) segments also become force nodes linked to polychain nodes.
// No phantoms, no popping — just polychain nodes + junctions.

import { deserializeSubgraph } from '../../../../graph/data/records/deserializer/deserialize-subgraph.js';
import { getForceNodes, getForceLinks } from '../force-data.js';
import { addPoppedNodes, removeNodesByChainIds, replacePolychainNodes } from '../../engines/force-engine.js';
import { state } from '../../../simplify-state.js';
import { pointToSegmentDist } from '../../../utils/geometry.js';
import { extractSubPolyline } from './polychain-gene-map.js';

// chainId → [polychain node objects in polyline order]
const chainPolychainNodes = new Map();
window.__pcNodes = chainPolychainNodes;  // debug access

// "s{id}" → polychain node (endpoint seg → head or tail node)
const segToPolychain = new Map();

// Per-root-chain counter for generating unique subchain IDs (c42:0, c42:1, ...)
const subchainCounters = new Map();

/** Check if a root chain ID has been split by pops (has subchains). */
export function isSplitRootChain(chainId) {
    const rootId = chainId.split(':')[0];
    return subchainCounters.has(rootId);
}

// Resampling constants
const MIN_NODES = 2;

/**
 * Compute cumulative arc lengths along a polyline.
 * Returns array of length pl.length with cumLen[0]=0.
 */
export function cumulativeLengths(pl) {
    const cumLen = [0];
    for (let i = 1; i < pl.length; i++) {
        cumLen.push(cumLen[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
    }
    return cumLen;
}

/**
 * Interpolate a point at arc-length distance `d` along a polyline.
 */
export function interpolateAtDist(pl, cumLen, d) {
    if (d <= 0) return [pl[0][0], pl[0][1]];
    if (d >= cumLen[cumLen.length - 1]) return [pl[pl.length - 1][0], pl[pl.length - 1][1]];
    // Binary search for the segment
    let lo = 0, hi = cumLen.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cumLen[mid] <= d) lo = mid; else hi = mid;
    }
    const segLen = cumLen[hi] - cumLen[lo];
    const t = segLen > 0 ? (d - cumLen[lo]) / segLen : 0;
    return [
        pl[lo][0] + t * (pl[hi][0] - pl[lo][0]),
        pl[lo][1] + t * (pl[hi][1] - pl[lo][1]),
    ];
}

/**
 * Resample a chain's polyline with node count proportional to bpSpan,
 * uniformly spaced along arc length.
 *
 * Returns array of [x, y] sample points (always includes first and last).
 */
function resamplePolyline(chain) {
    const pl = chain.polyline;
    if (!pl || pl.length < 2) return null;

    // Target node count from bp span (log curve), always enforced
    // log10(1k)=3 → 9, log10(10k)=4 → 16, log10(100k)=5 → 25
    // log10(1M)=6 → 36, log10(10M)=7 → 49
    const bp = chain.bpSpan || chain.length || 1;
    const logBp = Math.log10(Math.max(bp, 10));
    const nTarget = Math.max(MIN_NODES, Math.round(logBp * logBp));

    const cumLen = cumulativeLengths(pl);
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return pl;

    // Always resample to nTarget: both downsample dense and upsample sparse
    if (nTarget === pl.length) return pl;
    const samples = [pl[0]];
    for (let i = 1; i < nTarget - 1; i++) {
        samples.push(interpolateAtDist(pl, cumLen, totalLen * i / (nTarget - 1)));
    }
    samples.push(pl[pl.length - 1]);
    return samples;
}

// Minimum polychain nodes a chain must have before a pop split.
// Ensures both sides of any split get >= 2 nodes (with edge clamping).
const MIN_PRESPLIT_NODES = 8;

/**
 * Resample a chain's polychain nodes to targetCount by interpolating
 * along the current live positions.  Used before every pop to ensure
 * the chain has enough nodes for a clean split.
 *
 * No-op if the chain already has >= targetCount nodes.
 * Replaces old nodes/links in the force sim, rewires external links,
 * and updates chainPolychainNodes + segToPolychain.
 */
export function resamplePolychainLive(chainId, targetCount = MIN_PRESPLIT_NODES) {
    const oldNodes = chainPolychainNodes.get(chainId);
    if (!oldNodes || oldNodes.length >= targetCount || oldNodes.length < 2) return;

    // Build polylines from live and home positions
    const livePl = oldNodes.map(n => [n.x, n.y]);
    const homePl = oldNodes.map(n => [n.homeX, n.homeY]);
    const cumLive = cumulativeLengths(livePl);
    const cumHome = cumulativeLengths(homePl);
    const totalLive = cumLive[cumLive.length - 1];
    const totalHome = cumHome[cumHome.length - 1];

    if (totalLive === 0 && totalHome === 0) return;

    const template = oldNodes[0];
    const newNodes = [];
    const newLinks = [];

    for (let i = 0; i < targetCount; i++) {
        const t = i / (targetCount - 1);
        const [lx, ly] = totalLive > 0
            ? interpolateAtDist(livePl, cumLive, t * totalLive)
            : [livePl[0][0], livePl[0][1]];
        const [hx, hy] = totalHome > 0
            ? interpolateAtDist(homePl, cumHome, t * totalHome)
            : [homePl[0][0], homePl[0][1]];
        newNodes.push({
            id: `pn_${chainId}_r${i}`,
            iid: `pn_${chainId}_r${i}`,
            x: lx, y: ly,
            homeX: hx, homeY: hy,
            chainId,
            isPolychainNode: true,
            nodeIndex: i,
            chainNodeCount: targetCount,
            loopFactor: template.loopFactor || 0,
            radius: 0,
            width: 0,
        });
    }

    // Sequential polychain links
    const arcLen = cumulativeLengths(newNodes.map(n => [n.x, n.y]));
    const totalArc = arcLen[arcLen.length - 1];
    const uniformLen = totalArc / (targetCount - 1) || 5;
    for (let i = 0; i < targetCount - 1; i++) {
        newLinks.push({
            source: newNodes[i],
            target: newNodes[i + 1],
            isPolychainLink: true,
            isKinkLink: false,
            chainId,
            length: uniformLen,
            loopFactor: template.loopFactor || 0,
            chainArcLen: totalArc,
        });
    }

    // Update segToPolychain: old head/tail → new head/tail
    const oldHead = oldNodes[0];
    const oldTail = oldNodes[oldNodes.length - 1];
    const newHead = newNodes[0];
    const newTail = newNodes[newNodes.length - 1];
    for (const [key, pn] of segToPolychain) {
        if (pn === oldHead) segToPolychain.set(key, newHead);
        else if (pn === oldTail) segToPolychain.set(key, newTail);
    }

    // Swap in force sim (rewires bridge/inter-chain links to new head/tail)
    replacePolychainNodes(chainId, oldNodes, newNodes, newLinks);

    // Update our map
    chainPolychainNodes.set(chainId, newNodes);
}

// ---------------------------------------------------------------
// Ghost spine: hidden guide chain for popped subgraphs
// ---------------------------------------------------------------

const GHOST_SUFFIX = ':__ghost';

/** Check if a ghost spine exists for a root chain. */
export function hasGhostSpine(rootId) {
    return chainPolychainNodes.has(rootId + GHOST_SUFFIX);
}

/** Get the ghost spine node array for a root chain, or null. */
export function getGhostSpine(rootId) {
    return chainPolychainNodes.get(rootId + GHOST_SUFFIX) || null;
}

/**
 * Convert a chain's existing polychain nodes into a ghost spine.
 * The nodes stay in the force sim with all their existing links intact —
 * they just become invisible (isGhostSpine: true) and get re-keyed
 * under the ghost chain ID.  No cloning, no new links.
 * No-op if a ghost already exists for this root chain.
 */
export function createGhostSpine(chainId) {
    const rootId = chainId.split(':')[0];
    const ghostId = rootId + GHOST_SUFFIX;
    if (chainPolychainNodes.has(ghostId)) return;

    const nodes = chainPolychainNodes.get(chainId);
    if (!nodes || nodes.length < 2) return;

    // Mark existing nodes as ghost — they stay in the sim
    for (const n of nodes) {
        n.isGhostSpine = true;
        n.ghostRootId = rootId;
    }

    // Re-key: move from chainId to ghostId in our map
    chainPolychainNodes.delete(chainId);
    chainPolychainNodes.set(ghostId, nodes);

    // Update chainId on nodes and their links in the sim
    const oldChainId = nodes[0].chainId;
    for (const n of nodes) n.chainId = ghostId;
    for (const l of getForceLinks()) {
        if (l.isPolychainLink && l.chainId === oldChainId) {
            l.chainId = ghostId;
        }
    }

    // Update segToPolychain — ghost head/tail remain valid endpoints
    // (they're the same node objects, just re-flagged)
}

/**
 * Remove the ghost spine for a root chain (on full undo).
 * Restores the ghost nodes to normal visible polychain nodes under
 * the original root chain ID.
 */
export function removeGhostSpine(rootId) {
    const ghostId = rootId + GHOST_SUFFIX;
    const ghostNodes = chainPolychainNodes.get(ghostId);
    if (!ghostNodes) return;

    // Restore nodes to normal polychain
    for (const n of ghostNodes) {
        n.isGhostSpine = false;
        n.chainId = rootId;
        delete n.ghostRootId;
        delete n.ghostT;
    }

    // Re-key back to root chain ID
    chainPolychainNodes.delete(ghostId);
    chainPolychainNodes.set(rootId, ghostNodes);

    // Update link chainIds back
    for (const l of getForceLinks()) {
        if (l.isPolychainLink && l.chainId === ghostId) {
            l.chainId = rootId;
        }
    }
}

/**
 * Compute a node's ghostT (arc-length fraction along the ghost spine).
 * Projects the node's position onto the ghost polyline and returns 0–1.
 */
export function computeGhostT(node, ghostNodes) {
    if (!ghostNodes || ghostNodes.length < 2) return 0.5;

    const pl = ghostNodes.map(n => [n.x, n.y]);
    const cumLen = cumulativeLengths(pl);
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return 0.5;

    // Find nearest point on ghost polyline
    let bestDist = Infinity;
    let bestArcDist = 0;
    for (let i = 0; i < pl.length - 1; i++) {
        const ax = pl[i][0], ay = pl[i][1];
        const bx = pl[i + 1][0], by = pl[i + 1][1];
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        let t = 0;
        if (lenSq > 0) {
            t = Math.max(0, Math.min(1, ((node.x - ax) * dx + (node.y - ay) * dy) / lenSq));
        }
        const px = ax + t * dx, py = ay + t * dy;
        const d = Math.hypot(node.x - px, node.y - py);
        if (d < bestDist) {
            bestDist = d;
            bestArcDist = cumLen[i] + t * (cumLen[i + 1] - cumLen[i]);
        }
    }
    return bestArcDist / totalLen;
}

/**
 * Assign ghostT to all polychain nodes in a subchain, and ghostTStart/ghostTEnd
 * range to popped child nodes.
 */
export function assignGhostTValues(rootId, subchainNodes, childNodes, leftTailGhostT, rightHeadGhostT) {
    const ghostNodes = getGhostSpine(rootId);
    if (!ghostNodes) return;

    // Polychain subchain nodes: project each onto ghost
    for (const n of subchainNodes) {
        n.ghostT = computeGhostT(n, ghostNodes);
        n.ghostRootId = rootId;
    }

    // Popped child nodes: get the range between the two split boundaries
    const tStart = Math.min(leftTailGhostT, rightHeadGhostT);
    const tEnd = Math.max(leftTailGhostT, rightHeadGhostT);
    for (const n of childNodes) {
        n.ghostTStart = tStart;
        n.ghostTEnd = tEnd;
        n.ghostRootId = rootId;
    }
}

/**
 * Get the live [x,y] positions of a chain's polychain nodes.
 * Used by renderers to draw flexing polylines.
 */
export function getPolychainPositions(chainId) {
    const nodes = chainPolychainNodes.get(chainId);
    if (!nodes || nodes.length < 2) return null;
    return nodes.map(n => [n.x, n.y]);
}

/**
 * Get the raw polychain node array for a chain (for direct fx/fy manipulation).
 * Returns null if the chain has no polychain nodes.
 */
export function getPolychainNodesForChain(chainId) {
    return chainPolychainNodes.get(chainId) || null;
}

/**
 * Get live polylines for a chain. Returns array with one [[x,y],...] polyline,
 * or null if no polychain nodes exist for this chain.
 */
export function getPolychainPolylines(chainId) {
    const nodes = chainPolychainNodes.get(chainId);
    if (!nodes || nodes.length < 2) return null;
    return [nodes.map(n => [n.x, n.y])];
}

/**
 * Look up a segment ID in segToPolychain and return a record wrapper
 * suitable for use as a linkResolver result.
 */
export function getSegToPolychainRecord(segId) {
    const pn = segToPolychain.get(segId);
    if (!pn) return null;
    return makePolychainRecord(pn);
}

/**
 * Split a chain into two subchains after a bubble pop.
 * Reassigns polychain node chainIds, splits the polyline, creates subchain
 * objects in state.detailData.chains, and updates segToPolychain mappings.
 *
 * @param {string} chainId - chain being split (could be original or a prior subchain)
 * @param {number} splitIdx - polychain node index from spliceChainAtBubble
 * @param {string} popBubbleId - the bubble being popped (e.g. "b123")
 * @param {Array} poppedSourceSegs - source boundary segs from /pop response
 * @param {Array} poppedSinkSegs - sink boundary segs from /pop response
 * @returns {{ leftChain, rightChain, parentChain, parentIndex, tSplit }} or null
 */
export function splitChainOnPop(chainId, splitIdx, popBubbleId, poppedSourceSegs, poppedSinkSegs) {
    const nodes = chainPolychainNodes.get(chainId);
    if (!nodes || splitIdx < 0 || splitIdx >= nodes.length - 1) return null;

    const dd = state.detailData;
    if (!dd) return null;
    const parentIndex = dd.chains.findIndex(c => c.id === chainId);
    if (parentIndex === -1) return null;
    const parentChain = dd.chains[parentIndex];

    // Compute tSplit from homeX/homeY arc lengths (matches original polyline geometry)
    let leftLen = 0;
    for (let i = 1; i <= splitIdx; i++) {
        leftLen += Math.hypot(nodes[i].homeX - nodes[i-1].homeX, nodes[i].homeY - nodes[i-1].homeY);
    }
    let totalLen = leftLen;
    for (let i = splitIdx + 1; i < nodes.length; i++) {
        totalLen += Math.hypot(nodes[i].homeX - nodes[i-1].homeX, nodes[i].homeY - nodes[i-1].homeY);
    }
    const tSplit = totalLen > 0 ? leftLen / totalLen : 0.5;

    // Generate subchain IDs: c42:0, c42:1, ... (counter per root chain)
    const rootId = chainId.split(':')[0];
    if (!subchainCounters.has(rootId)) subchainCounters.set(rootId, 0);
    let counter = subchainCounters.get(rootId);
    const leftId = `${rootId}:${counter++}`;
    const rightId = `${rootId}:${counter++}`;
    subchainCounters.set(rootId, counter);

    // Create ghost spine on the first split of a root chain.
    // The ghost preserves the full chain shape under macro forces.
    if (!hasGhostSpine(rootId)) {
        createGhostSpine(chainId);
    }

    // Split polychain nodes — just reassign chainIds (nodes are already in the force sim).
    // Pre-split resampling (in popBubbleCircle) + edge clamping guarantees both
    // sides always get >= 2 nodes, so no synthetic nodes are needed.
    const leftNodes = nodes.slice(0, splitIdx + 1);
    const rightNodes = nodes.slice(splitIdx + 1);
    for (const n of leftNodes) n.chainId = leftId;
    for (const n of rightNodes) n.chainId = rightId;

    // Assign ghostT to each subchain node (arc-length fraction along ghost)
    const ghostNodes = getGhostSpine(rootId);
    if (ghostNodes) {
        for (const n of leftNodes) {
            n.ghostT = computeGhostT(n, ghostNodes);
            n.ghostRootId = rootId;
        }
        for (const n of rightNodes) {
            n.ghostT = computeGhostT(n, ghostNodes);
            n.ghostRootId = rootId;
        }
    }

    chainPolychainNodes.delete(chainId);
    chainPolychainNodes.set(leftId, leftNodes);
    chainPolychainNodes.set(rightId, rightNodes);

    // Split the static polyline for the subchain objects
    const pl = parentChain.polyline;
    const leftPolyline = extractSubPolyline(pl, 0, tSplit) || [pl[0]];
    const rightPolyline = extractSubPolyline(pl, tSplit, 1) || [pl[pl.length - 1]];

    // Build subchain objects matching processResponse shape.
    // Ancestors should reflect the ROOT chain's original ancestry, not intermediate
    // subchain splits. All subchains of c123 are flat siblings — the split history
    // is tracked by the pop tree, not the ancestors array.
    const isSubchain = chainId !== rootId;
    const rootAncestors = isSubchain
        ? (parentChain.ancestors || []).filter(a => !a.chain.startsWith(rootId + ':'))
        : (parentChain.ancestors || []);
    const ancestors = rootAncestors;

    const leftChain = buildSubchain(leftId, leftPolyline, parentChain, {
        sourceSegs: parentChain.sourceSegs,
        sinkSegs: poppedSourceSegs.map(Number),
        tFraction: tSplit,
        isLeft: true,
        ancestors,
        rootId,
    });
    const rightChain = buildSubchain(rightId, rightPolyline, parentChain, {
        sourceSegs: poppedSinkSegs.map(Number),
        sinkSegs: parentChain.sinkSegs,
        tFraction: 1 - tSplit,
        isLeft: false,
        ancestors,
        rootId,
    });

    // Replace parent in detailData.chains
    dd.chains.splice(parentIndex, 1, leftChain, rightChain);

    // Update segToPolychain for the new boundary segments
    const leftTail = leftNodes[leftNodes.length - 1];
    const rightHead = rightNodes[0];
    for (const sid of poppedSourceSegs) segToPolychain.set(`s${sid}`, leftTail);
    for (const sid of poppedSinkSegs) segToPolychain.set(`s${sid}`, rightHead);

    // Track subchain IDs so they survive viewport panning.
    // Also track the parent chainId so the fetcher doesn't re-add the original
    // chain from the backend (it's been replaced by subchains).
    state.poppedChainIds.add(chainId);
    state.poppedChainIds.add(leftId);
    state.poppedChainIds.add(rightId);

    return { leftChain, rightChain, parentChain, parentIndex, tSplit };
}

/**
 * Reverse a splitChainOnPop: merge two subchains back into the parent chain.
 */
export function mergeSubchainsOnUnpop(leftId, rightId, savedParentChain, parentIndex) {
    const dd = state.detailData;
    if (!dd) return;

    // Merge polychain nodes back under parent chainId
    const leftNodes = chainPolychainNodes.get(leftId) || [];
    const rightNodes = chainPolychainNodes.get(rightId) || [];
    const merged = [...leftNodes, ...rightNodes];
    for (const n of merged) n.chainId = savedParentChain.id;

    chainPolychainNodes.delete(leftId);
    chainPolychainNodes.delete(rightId);
    chainPolychainNodes.set(savedParentChain.id, merged);

    // Restore parent in detailData.chains — find where the subchains are now
    const leftIdx = dd.chains.findIndex(c => c.id === leftId);
    const rightIdx = dd.chains.findIndex(c => c.id === rightId);
    // Remove both subchains (remove higher index first to preserve positions)
    const indices = [leftIdx, rightIdx].filter(i => i !== -1).sort((a, b) => b - a);
    for (const i of indices) dd.chains.splice(i, 1);
    // Insert parent at the saved index (clamped to current length)
    const insertAt = Math.min(parentIndex, dd.chains.length);
    dd.chains.splice(insertAt, 0, savedParentChain);

    // Restore segToPolychain for parent's original endpoint segs
    if (merged.length > 0) {
        const head = merged[0];
        const tail = merged[merged.length - 1];
        for (const sid of (savedParentChain.sourceSegs || [])) {
            segToPolychain.set(`s${sid}`, head);
        }
        for (const sid of (savedParentChain.sinkSegs || [])) {
            segToPolychain.set(`s${sid}`, tail);
        }
    }

    // Remove subchain IDs from poppedChainIds
    state.poppedChainIds.delete(leftId);
    state.poppedChainIds.delete(rightId);
}

/**
 * Remove a chain's polychain nodes entirely (when fully popped).
 * Returns the chain IDs that were removed (for force-engine cleanup).
 */
export function removeChainEntirely(chainId) {
    const nodes = chainPolychainNodes.get(chainId);
    const removedNodes = nodes ? [...nodes] : [];

    if (nodes) {
        const nodeSet = new Set(nodes);
        for (const [key, pn] of segToPolychain) {
            if (nodeSet.has(pn)) segToPolychain.delete(key);
        }
        chainPolychainNodes.delete(chainId);
    }

    // Remove from detailData.chains
    const dd = state.detailData;
    let removedChain = null;
    let removedIndex = -1;
    if (dd) {
        removedIndex = dd.chains.findIndex(c => c.id === chainId);
        if (removedIndex !== -1) {
            removedChain = dd.chains.splice(removedIndex, 1)[0];
        }
    }

    return { chainIds: new Set([chainId]), removedNodes, removedChain, removedIndex };
}

/**
 * Restore a chain that was removed by removeChainEntirely (for undo).
 */
export function restoreChain(chainId, removalInfo) {
    const { removedNodes, removedChain, removedIndex } = removalInfo;

    if (removedNodes.length > 0) {
        chainPolychainNodes.set(chainId, removedNodes);
        // Restore segToPolychain
        const head = removedNodes[0];
        const tail = removedNodes[removedNodes.length - 1];
        if (removedChain) {
            for (const sid of (removedChain.sourceSegs || [])) {
                segToPolychain.set(`s${sid}`, head);
            }
            for (const sid of (removedChain.sinkSegs || [])) {
                segToPolychain.set(`s${sid}`, tail);
            }
        }
    }

    if (removedChain) {
        const dd = state.detailData;
        if (dd) {
            const insertAt = Math.min(removedIndex, dd.chains.length);
            dd.chains.splice(insertAt, 0, removedChain);
        }
    }
}

// ---------------------------------------------------------------
// Subchain builder
// ---------------------------------------------------------------

function buildSubchain(id, polyline, parent, opts) {
    const { sourceSegs, sinkSegs, tFraction, isLeft, ancestors, rootId } = opts;
    return {
        id,
        polyline,
        length: Math.round(parent.length * tFraction),
        gcCount: Math.round((parent.gcCount || 0) * tFraction),
        bpSpan: Math.round((parent.bpSpan || parent.length) * tFraction),
        nBubbles: 0,  // will be updated when bubble store is split
        type: 'chain',
        size: 0,
        isRef: parent.isRef,
        record: {
            seqLength: Math.round(parent.length * tFraction),
            gcCount: Math.round((parent.gcCount || 0) * tFraction),
            start: parent.record?.start ?? null,
            end: parent.record?.end ?? null,
        },
        subtype: parent.subtype,
        depth: parent.depth,
        connector: false,
        bubbleIds: null,
        sourceSegs,
        sinkSegs,
        bubblePositions: null,
        bpStart: isLeft ? parent.bpStart : null,
        bpEnd: isLeft ? null : parent.bpEnd,
        bpHead: isLeft ? parent.bpHead : null,
        bpTail: isLeft ? null : parent.bpTail,
        parentChain: rootId,  // always points to the root chain, not intermediate subchains
        ancestors,
        popped: false,
        graph: null,
        loopFactor: 0,
        stepCount: parent.stepCount,
    };
}

/**
 * Flip a chain: reverse polychain node positions so head↔tail swap visually.
 * Node array order, nodeIndex, links, and segToPolychain are unchanged.
 */
export function flipChain(chainId) {
    const nodes = chainPolychainNodes.get(chainId);
    if (!nodes || nodes.length < 2) return false;

    const positions = nodes.map(n => ({ x: n.x, y: n.y, homeX: n.homeX, homeY: n.homeY }));
    for (let i = 0; i < nodes.length; i++) {
        const rev = positions[nodes.length - 1 - i];
        nodes[i].x = rev.x;
        nodes[i].y = rev.y;
        nodes[i].homeX = rev.homeX;
        nodes[i].homeY = rev.homeY;
    }
    return true;
}

/**
 * Initialize the polychain layer: create polychain nodes from chain polylines,
 * junction nodes from naked segments, and all links connecting them.
 * Called once after detailData is set.
 */
export function initPolychainLayer() {
    const dd = state.detailData;
    if (!dd) return;

    chainPolychainNodes.clear();
    segToPolychain.clear();

    const allNodes = [];
    const allLinks = [];

    // 1. Create polychain nodes for every chain (resampled by bp size + bubble density)
    for (const chain of dd.chains) {
        createPolychainForChain(chain, allNodes, allLinks, dd);
    }

    // 2. Deserialize junction graph nodes + links
    processJunctionGraph(dd, allNodes, allLinks);

    // 4. Shared-segment links: adjacent chains sharing an endpoint seg
    const seenSharedPairs = new Set();
    for (const chain of dd.chains) {
        for (const sid of (chain.sinkSegs || [])) {
            const key = `s${sid}`;
            const sinkNode = chainPolychainNodes.get(chain.id);
            if (!sinkNode || sinkNode.length === 0) continue;
            const tail = sinkNode[sinkNode.length - 1];
            for (const other of dd.chains) {
                if (other.id === chain.id) continue;
                if (!(other.sourceSegs || []).includes(sid)) continue;
                const otherNodes = chainPolychainNodes.get(other.id);
                if (!otherNodes || otherNodes.length === 0) continue;
                const otherHead = otherNodes[0];
                if (tail === otherHead) continue;
                const pairKey = `${tail.iid}↔${otherHead.iid}`;
                if (seenSharedPairs.has(pairKey)) continue;
                seenSharedPairs.add(pairKey);
                allLinks.push(makeInterChainLink(tail, otherHead, String(sid), String(sid)));
            }
        }
    }

    if (allNodes.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }
}

/**
 * Process junction graph nodes + links into force-sim objects.
 * Shared by both init and incremental paths.
 */
function processJunctionGraph(dd, allNodes, allLinks) {
    const jg = dd.junctionGraph;
    const jls = dd.junctionLinks;
    const junctionNodeIdSet = new Set();

    if (jg && jg.nodes.length > 0) {
        for (const n of jg.nodes) junctionNodeIdSet.add(n.id);

        // Build polychain record wrappers for link resolution
        const polychainRecords = new Map();
        for (const [chainId, nodes] of chainPolychainNodes) {
            if (nodes.length === 0) continue;
            const head = nodes[0];
            const tail = nodes[nodes.length - 1];
            polychainRecords.set(head.iid, makePolychainRecord(head));
            polychainRecords.set(tail.iid, makePolychainRecord(tail));
        }

        // Build segToChainPolychain for non-endpoint segs (from junctionSegChains).
        // Uses geometric proximity to pick head vs tail of the nearest chain.
        const segToChainPolychain = new Map();
        const jscMap = dd.junctionSegChains || {};
        const junctionNodePosMap = new Map(jg.nodes.map(n => [n.id, n]));

        for (const rawLink of (jg.links || [])) {
            const sId = typeof rawLink.source === 'string' ? rawLink.source : `s${rawLink.source}`;
            const tId = typeof rawLink.target === 'string' ? rawLink.target : `s${rawLink.target}`;
            for (const [segId, otherSegId] of [[sId, tId], [tId, sId]]) {
                if (segToPolychain.has(segId) || segToChainPolychain.has(segId)) continue;
                if (junctionNodeIdSet.has(segId)) continue;
                const chainIds = jscMap[segId];
                if (!chainIds || chainIds.length === 0) continue;
                const otherNode = junctionNodePosMap.get(otherSegId);
                for (const cid of chainIds) {
                    const nodes = chainPolychainNodes.get(cid);
                    if (!nodes || nodes.length === 0) continue;
                    const head = nodes[0];
                    const tail = nodes[nodes.length - 1];
                    let pick;
                    if (otherNode) {
                        const refX = (otherNode.x1 + otherNode.x2) / 2;
                        const refY = (otherNode.y1 + otherNode.y2) / 2;
                        const dH = Math.hypot(refX - head.x, refY - head.y);
                        const dT = Math.hypot(refX - tail.x, refY - tail.y);
                        pick = dH <= dT ? head : tail;
                    } else {
                        pick = head;
                    }
                    segToChainPolychain.set(segId, polychainRecords.get(pick.iid));
                    break;
                }
            }
        }

        // Deserialize junction nodes + links with polychain linkResolver
        const { nodes: jNodes, links: jLinks } = deserializeSubgraph(
            { nodes: jg.nodes, links: jg.links || [] },
            {
                tag: { chainId: '__junction__' },
                detectIndels: false,
                linkResolver: (segId) => {
                    const pn = segToPolychain.get(segId);
                    if (pn) return polychainRecords.get(pn.iid);
                    return segToChainPolychain.get(segId) || null;
                },
            }
        );

        // Set initial positions from ODGI layout — interpolate kinks along segment geometry
        const rawNodeMap = new Map(jg.nodes.map(n => [n.id, n]));
        const kinksByRecord = new Map();
        for (const node of jNodes) {
            if (!kinksByRecord.has(node.id)) kinksByRecord.set(node.id, []);
            kinksByRecord.get(node.id).push(node);
        }
        for (const [recId, kinks] of kinksByRecord) {
            const raw = rawNodeMap.get(recId);
            if (!raw) continue;
            kinks.sort((a, b) => {
                const ai = parseInt(a.iid.split('#')[1]) || 0;
                const bi = parseInt(b.iid.split('#')[1]) || 0;
                return ai - bi;
            });
            const n = kinks.length;
            for (let i = 0; i < n; i++) {
                const t = n === 1 ? 0.5 : i / (n - 1);
                kinks[i].x = raw.x1 + t * (raw.x2 - raw.x1);
                kinks[i].y = raw.y1 + t * (raw.y2 - raw.y1);
                kinks[i].homeX = kinks[i].x;
                kinks[i].homeY = kinks[i].y;
            }
        }

        allNodes.push(...jNodes);

        // Tag inter-chain links with seg IDs (for future rewiring if needed)
        const interNodeLinks = jLinks.filter(l => !l.isKinkLink);
        let createdIdx = 0;
        for (const rawLink of (jg.links || [])) {
            const sId = typeof rawLink.source === 'string' ? rawLink.source : `s${rawLink.source}`;
            const tId = typeof rawLink.target === 'string' ? rawLink.target : `s${rawLink.target}`;

            const sLocal = junctionNodeIdSet.has(sId);
            const tLocal = junctionNodeIdSet.has(tId);
            const sPolychain = !sLocal && (segToPolychain.has(sId) || segToChainPolychain.has(sId));
            const tPolychain = !tLocal && (segToPolychain.has(tId) || segToChainPolychain.has(tId));
            if (!(sLocal || sPolychain) || !(tLocal || tPolychain)) continue;

            const link = interNodeLinks[createdIdx++];
            if (!link) break;

            if (sPolychain || tPolychain) {
                link.isInterChain = true;
                link.chainId = null;
                if (sPolychain) {
                    link.sourceSegId = sId.replace(/^s/, '');
                    link.sourceStrand = rawLink.from_strand || null;
                }
                if (tPolychain) {
                    link.targetSegId = tId.replace(/^s/, '');
                    link.targetStrand = rawLink.to_strand || null;
                }
            }
        }

        allLinks.push(...jLinks);

        // Endpoint-to-endpoint junction links (neither seg in junction graph)
        if (jls && jls.length > 0) {
            for (const jl of jls) {
                const segA = `s${jl.segs[0]}`;
                const segB = `s${jl.segs[1]}`;
                if (junctionNodeIdSet.has(segA) || junctionNodeIdSet.has(segB)) continue;
                const pnA = segToPolychain.get(segA);
                const pnB = segToPolychain.get(segB);
                if (pnA && pnB && pnA !== pnB) {
                    allLinks.push(makeInterChainLink(pnA, pnB, String(jl.segs[0]), String(jl.segs[1])));
                }
            }
        }

    } else if (jls && jls.length > 0) {
        // No junction graph nodes — endpoint-to-endpoint only
        for (const jl of jls) {
            const pnA = segToPolychain.get(`s${jl.segs[0]}`);
            const pnB = segToPolychain.get(`s${jl.segs[1]}`);
            if (pnA && pnB && pnA !== pnB) {
                allLinks.push(makeInterChainLink(pnA, pnB, String(jl.segs[0]), String(jl.segs[1])));
            }
        }
    }
}

/**
 * Add polychain nodes for newly added chains only (incremental on pan).
 */
export function addChainsToPolychainLayer(newChains, dd) {
    if (!dd || newChains.length === 0) return;

    const allNodes = [];
    const allLinks = [];

    // 1. Create polychain nodes for new chains
    for (const chain of newChains) {
        if (chainPolychainNodes.has(chain.id)) continue;
        createPolychainForChain(chain, allNodes, allLinks, dd);
    }

    // 2. Shared-segment links between new and existing chains
    const newChainIds = new Set(newChains.map(c => c.id));
    const seenSharedPairs = new Set();
    for (const chain of dd.chains) {
        for (const sid of (chain.sinkSegs || [])) {
            const sinkNodes = chainPolychainNodes.get(chain.id);
            if (!sinkNodes || sinkNodes.length === 0) continue;
            const tail = sinkNodes[sinkNodes.length - 1];
            for (const other of dd.chains) {
                if (other.id === chain.id) continue;
                if (!newChainIds.has(chain.id) && !newChainIds.has(other.id)) continue;
                if (!(other.sourceSegs || []).includes(sid)) continue;
                const otherNodes = chainPolychainNodes.get(other.id);
                if (!otherNodes || otherNodes.length === 0) continue;
                const otherHead = otherNodes[0];
                if (tail === otherHead) continue;
                const pairKey = `${tail.iid}↔${otherHead.iid}`;
                if (seenSharedPairs.has(pairKey)) continue;
                seenSharedPairs.add(pairKey);
                allLinks.push(makeInterChainLink(tail, otherHead, String(sid), String(sid)));
            }
        }
    }

    // 3. Remove old junction nodes from sim, then rebuild from current data
    removeNodesByChainIds(new Set(['__junction__']));
    processJunctionGraph(dd, allNodes, allLinks);

    if (allNodes.length > 0 || allLinks.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }
}

/**
 * Remove polychain nodes for specific chains.
 */
export function removeChainsFromPolychainLayer(chainIds) {
    for (const cid of chainIds) {
        const nodes = chainPolychainNodes.get(cid);
        if (nodes) {
            const nodeSet = new Set(nodes);
            for (const [key, pn] of segToPolychain) {
                if (nodeSet.has(pn)) segToPolychain.delete(key);
            }
            chainPolychainNodes.delete(cid);
        }
    }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * Create polychain nodes + links for a single chain and append to allNodes/allLinks.
 * Resamples the polyline based on bp size and bubble density.
 */
/**
 * Compute loop factor from polyline geometry.
 * 1 - (head-to-tail distance / arc length). 0 = perfectly straight, 1 = endpoints overlap.
 */
function computeLoopFactor(pl) {
    if (!pl || pl.length < 3) return 0;
    const headToTail = Math.hypot(
        pl[pl.length - 1][0] - pl[0][0],
        pl[pl.length - 1][1] - pl[0][1]);
    let arcLen = 0;
    for (let i = 1; i < pl.length; i++) {
        arcLen += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
    }
    if (arcLen === 0) return 0;
    return Math.max(0, Math.min(1, 1 - headToTail / arcLen));
}

/**
 * Reconstruct a parent chain's polyline from its connector fragments.
 * The parent (e.g. "c123") is decomposed into connectors ("c123:100-200").
 * Falls back to exact match if the parent chain is still present as-is.
 */
function getParentPolyline(parentChainId, dd) {
    // Try exact match first
    const exact = dd.chains.find(c => c.id === parentChainId);
    if (exact?.polyline?.length >= 2) return exact.polyline;

    // Collect connector fragments: chains whose ID starts with "c123:"
    const prefix = parentChainId + ':';
    const connectors = dd.chains.filter(c => c.id.startsWith(prefix) && c.polyline?.length >= 2);
    if (connectors.length === 0) return null;

    // Sort by x-coordinate of first polyline point (connectors are spatially ordered)
    connectors.sort((a, b) => a.polyline[0][0] - b.polyline[0][0]);

    // Concatenate polylines
    const combined = [];
    for (const c of connectors) {
        combined.push(...c.polyline);
    }
    return combined.length >= 2 ? combined : null;
}

function createPolychainForChain(chain, allNodes, allLinks, dd) {
    // Prefer backend-precomputed polychain nodes, fall back to JS resampling
    const samples = chain.polychainNodes || resamplePolyline(chain);
    if (!samples || samples.length < 2) return;

    const nSamples = samples.length;
    const loopFactor = computeLoopFactor(chain.polyline);
    chain.loopFactor = loopFactor;

    const nodes = [];
    for (let i = 0; i < nSamples; i++) {
        const node = {
            id: `pn_${chain.id}_${i}`,
            iid: `pn_${chain.id}_${i}`,
            x: samples[i][0],
            y: samples[i][1],
            homeX: samples[i][0],
            homeY: samples[i][1],
            chainId: chain.id,
            isPolychainNode: true,
            nodeIndex: i,
            chainNodeCount: nSamples,
            loopFactor: loopFactor,
            radius: 0,
            width: 0,
        };
        nodes.push(node);
        allNodes.push(node);
    }

    chainPolychainNodes.set(chain.id, nodes);

    // Compute parent-side perpendiculars for child chains (not connectors).
    // Walk up the full ancestor chain so deeper children push away from all ancestors.
    if (dd && chain.ancestors?.length > 0) {
        // Child centroid
        let cx = 0, cy = 0;
        for (const n of nodes) { cx += n.x; cy += n.y; }
        cx /= nodes.length; cy /= nodes.length;

        const perps = [];
        for (const ancestor of chain.ancestors) {
            const ppl = getParentPolyline(ancestor.chain, dd);
            if (!ppl || ppl.length < 2) continue;

            // Find nearest segment on ancestor polyline
            let bestDist = Infinity, bestIdx = 0;
            for (let i = 0; i < ppl.length - 1; i++) {
                const d = pointToSegmentDist(cx, cy, ppl[i][0], ppl[i][1], ppl[i+1][0], ppl[i+1][1]);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }

            // Nearest point on ancestor segment (projection of centroid)
            const ax = ppl[bestIdx][0], ay = ppl[bestIdx][1];
            const bx = ppl[bestIdx+1][0], by = ppl[bestIdx+1][1];
            const tx = bx - ax, ty = by - ay;
            const tLenSq = tx * tx + ty * ty;
            const tLen = Math.sqrt(tLenSq) || 1;
            const t = tLenSq > 0
                ? Math.max(0, Math.min(1, ((cx - ax) * tx + (cy - ay) * ty) / tLenSq))
                : 0;
            const mx = ax + t * tx;
            const my = ay + t * ty;

            // Perpendicular (rotate tangent 90°)
            let px = -ty / tLen, py = tx / tLen;

            // Determine which side child centroid is on
            const dot = (cx - mx) * px + (cy - my) * py;
            if (dot < 0) { px = -px; py = -py; }

            perps.push({ px, py, mx, my, ppl });
        }

        if (perps.length > 0) {
            for (const n of nodes) {
                n.parentPerps = perps;
            }
        }
    }

    // Sequential links — rest length = initial geometric distance between samples
    // Compute total arc length for variable link stiffness
    let chainArcLen = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
        chainArcLen += Math.hypot(
            samples[i + 1][0] - samples[i][0],
            samples[i + 1][1] - samples[i][1]);
    }
    const uniformLen = chainArcLen / (nodes.length - 1) || 1;
    for (let i = 0; i < nodes.length - 1; i++) {
        allLinks.push({
            source: nodes[i],
            target: nodes[i + 1],
            isPolychainLink: true,
            isKinkLink: false,
            chainId: chain.id,
            length: uniformLen,
            loopFactor: loopFactor,
            chainArcLen: chainArcLen,
        });
    }

    // Map endpoint segs → head/tail polychain nodes
    const head = nodes[0];
    const tail = nodes[nodes.length - 1];
    for (const sid of (chain.sourceSegs || [])) {
        segToPolychain.set(`s${sid}`, head);
    }
    for (const sid of (chain.sinkSegs || [])) {
        segToPolychain.set(`s${sid}`, tail);
    }
}

/**
 * Create a lightweight record wrapper for a polychain node, satisfying the
 * NodeRecord interface expected by deserializeSubgraph's linkResolver.
 */
function makePolychainRecord(node) {
    return {
        id: node.id,
        type: 'polychain',
        ranges: [],
        elements: {
            nodes: [{ head: () => node.iid, tail: () => node.iid }],
        },
    };
}

function makeInterChainLink(source, target, sourceSegId, targetSegId) {
    return {
        source, target,
        isInterChain: true,
        isKinkLink: false,
        chainId: null,
        length: 10,
        sourceSegId: sourceSegId || null,
        targetSegId: targetSegId || null,
    };
}


