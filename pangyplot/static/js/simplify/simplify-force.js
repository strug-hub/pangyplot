// D3-force simulation for popped chain subgraphs.
// Manages a single simulation containing all popped nodes+links.
// Chain polylines and skeleton are NOT in the simulation — static canvas draws only.

import { state } from './simplify-state.js';
import { scheduleFrame } from './render.js';

let sim = null;
const homePos = new WeakMap();  // node → { x, y }

// ---------------------------------------------------------------
// Simulation lifecycle
// ---------------------------------------------------------------

export function initForce() {
    if (sim) return;
    // Force parameters: core app inspired but tuned for simplify's data-space
    sim = d3.forceSimulation([])
        .alphaMin(0.001)
        .alpha(0)
        .alphaDecay(0.005)           // moderate cooldown
        .velocityDecay(0.3)          // moderate friction
        .force('link', d3.forceLink([]).id(d => d.id).distance(d => d.length || 10).strength(0.8))
        .force('charge', d3.forceManyBody().strength(-30).distanceMax(100))
        .force('collide', d3.forceCollide().radius(d => d.radius || 3).strength(0.5).iterations(2))
        .force('anchorX', d3.forceX(d => homePos.get(d)?.x ?? d.x).strength(0.15))
        .force('anchorY', d3.forceY(d => homePos.get(d)?.y ?? d.y).strength(0.15))
        .on('tick', onTick);
    sim.stop();  // Don't auto-run — we control when to reheat
}

function onTick() {
    if (state.detailPhase === 'static' || state.detailPhase === 'collapsing') {
        scheduleFrame();
    }
}

// ---------------------------------------------------------------
// Add/remove popped chain nodes
// ---------------------------------------------------------------

/**
 * Add nodes and links from a popped chain into the simulation.
 * Each node must have: { id, x, y, radius }
 * Each link must have: { source: id, target: id, length }
 * homeX/homeY are the anchor positions (from chain polyline region).
 */
export function addPoppedNodes(nodes, links) {
    if (!sim) initForce();

    // Stash home positions for anchor forces
    for (const n of nodes) {
        homePos.set(n, { x: n.x, y: n.y });
    }

    // Merge into existing simulation
    const allNodes = [...sim.nodes(), ...nodes];
    const allLinks = [...sim.force('link').links(), ...links];

    sim.nodes(allNodes);
    sim.force('link').links(allLinks);
    sim.force('anchorX', d3.forceX(d => homePos.get(d)?.x ?? d.x).strength(0.05));
    sim.force('anchorY', d3.forceY(d => homePos.get(d)?.y ?? d.y).strength(0.05));

    // Reheat
    sim.alpha(0.3).restart();
}

/**
 * Remove all nodes belonging to a specific chain from the simulation.
 */
export function removePoppedNodes(chainId) {
    if (!sim) return;

    const remaining = sim.nodes().filter(n => n.chainId !== chainId);
    const remainingIds = new Set(remaining.map(n => n.id));
    const remainingLinks = sim.force('link').links().filter(
        l => remainingIds.has(l.source.id || l.source) && remainingIds.has(l.target.id || l.target)
    );

    sim.nodes(remaining);
    sim.force('link').links(remainingLinks);

    if (remaining.length > 0) {
        sim.alpha(0.1).restart();
    } else {
        sim.stop();
    }
}

/**
 * Clear all popped nodes and stop simulation.
 */
export function clearForce() {
    if (!sim) return;
    sim.stop();
    sim.nodes([]);
    sim.force('link').links([]);
}

/**
 * Increase anchor strength to collapse nodes back to polyline positions.
 * Call this on zoom-out before clearing.
 */
export function collapseToAnchors(strength = 0.5) {
    if (!sim || sim.nodes().length === 0) return;
    sim.force('anchorX', d3.forceX(d => homePos.get(d)?.x ?? d.x).strength(strength));
    sim.force('anchorY', d3.forceY(d => homePos.get(d)?.y ?? d.y).strength(strength));
    sim.alpha(0.3).restart();
}

/**
 * Get current simulation nodes for rendering.
 */
export function getForceNodes() {
    return sim ? sim.nodes() : [];
}

/**
 * Get current simulation links for rendering.
 */
export function getForceLinks() {
    return sim ? sim.force('link').links() : [];
}

/**
 * Whether the simulation is running.
 */
export function isSimulating() {
    return sim && sim.alpha() > sim.alphaMin();
}
