// Chain-aware drag influence force for the viewer.
// BFS from dragged node(s) through force links, applying dampened
// movement to connected nodes based on graph distance.

import { state } from '../../state.js';
import { getForceLinks } from '../../detail/data/force-data.js';
import { getContainer } from '../../detail/model/model-manager.js';

const MAX_DEPTH = 200;

let influence = 0.45;
let cache = null;        // Map<node, depth>
let prevPos = { x: null, y: null };

export function getInfluence() { return influence; }
export function setInfluence(v) { influence = v; }

// Exponential decay per chain hop: dampen = influence^depth.
// influence=1 → all neighbors follow at 100%. influence=0.01 → only dragged element moves.
// This replaces the core graph's linear decay which was tuned for per-node BFS,
// not the chain-grouped BFS used here.

// ---------------------------------------------------------------
// BFS cache: maps each reachable node to its graph distance
// ---------------------------------------------------------------

function buildCache() {
    cache = new Map();

    if (!state.dragMode || !state.dragTarget) return;

    // Seed nodes at depth 0
    const seeds = [];
    if (state.dragMode === 'node') {
        seeds.push(state.dragTarget);
    } else if (state.dragMode === 'chain') {
        const nodes = state.dragChainNodes;
        if (nodes) {
            for (const n of nodes) seeds.push(n);
        }
    }

    const visited = new Set();
    const queue = [];
    for (const s of seeds) {
        visited.add(s);
        cache.set(s, 0);
        queue.push({ node: s, depth: 0 });
    }

    // Build adjacency from link list (once per cache build)
    const links = getForceLinks();
    const adj = new Map();
    for (const link of links) {
        const s = link.source;
        const t = link.target;
        if (!adj.has(s)) adj.set(s, []);
        if (!adj.has(t)) adj.set(t, []);
        adj.get(s).push(t);
        adj.get(t).push(s);
    }

    // BFS
    while (queue.length > 0) {
        const { node, depth } = queue.shift();
        if (depth >= MAX_DEPTH) continue;

        const neighbors = adj.get(node);
        if (!neighbors) continue;
        for (const nb of neighbors) {
            if (visited.has(nb)) continue;
            // Skip already-pinned nodes (don't propagate through anchored nodes)
            if (nb.fx !== undefined && !seeds.includes(nb)) continue;
            visited.add(nb);
            const nbDepth = depth + 1;
            cache.set(nb, nbDepth);

            // Chain-aware: when we reach a polychain node, pull in its siblings
            // at the same depth so whole chains move together
            if (nb.isPolychainNode && nb.chainId) {
                const chainNodes = getContainer(nb.chainId)?.spineNodes;
                if (chainNodes) {
                    for (const cn of chainNodes) {
                        if (!visited.has(cn)) {
                            visited.add(cn);
                            const existing = cache.get(cn);
                            if (existing === undefined || nbDepth < existing) {
                                cache.set(cn, nbDepth);
                            }
                            queue.push({ node: cn, depth: nbDepth });
                        }
                    }
                }
            }

            queue.push({ node: nb, depth: nbDepth });
        }
    }
}

// ---------------------------------------------------------------
// D3 custom force function
// ---------------------------------------------------------------

export function dragInfluenceForce() {
    return function force(_alpha) {
        if (!state.dragMode) {
            prevPos = { x: null, y: null };
            cache = null;
            return;
        }

        if (!cache) buildCache();

        // Compute movement delta from the drag anchor point
        let anchorX, anchorY;
        if (state.dragMode === 'node') {
            anchorX = state.dragTarget.x;
            anchorY = state.dragTarget.y;
        } else {
            anchorX = state.dragPrevDataX;
            anchorY = state.dragPrevDataY;
        }

        const { x: px, y: py } = prevPos;
        prevPos = { x: anchorX, y: anchorY };
        if (px === null || py === null) return;

        const dx = anchorX - px;
        const dy = anchorY - py;
        if (dx === 0 && dy === 0) return;

        for (const [node, depth] of cache) {
            // Skip the dragged target(s) — they're already moved by drag-engine
            if (state.dragMode === 'node' && node === state.dragTarget) continue;
            if (state.dragMode === 'chain' && state.dragChainNodes && state.dragChainNodes.includes(node)) continue;

            const dampen = depth === 0 ? 1 : Math.pow(influence, depth);
            if (dampen <= 0) continue;

            node.x += dx * dampen;
            node.y += dy * dampen;

            // If node is pinned (fx/fy set), update fixed pos too
            if (node.fx !== undefined) node.fx += dx * dampen;
            if (node.fy !== undefined) node.fy += dy * dampen;
        }
    };
}

export function invalidateCache() {
    cache = null;
}

/** Reset tracking state — call when a new drag begins so stale
 *  prevPos from a previous drag can't produce a huge delta. */
export function resetDragInfluence() {
    prevPos = { x: null, y: null };
    cache = null;
}
