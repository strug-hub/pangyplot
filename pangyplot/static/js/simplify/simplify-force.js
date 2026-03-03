// D3-force simulation for popped chain subgraphs.
// Manages a single simulation containing all popped nodes+links.
// Chain polylines and skeleton are NOT in the simulation — static canvas draws only.

import { state } from './simplify-state.js';
import { scheduleFrame } from './render.js';
import defaults from '../graph/forces/settings/force-defaults.js';

let sim = null;
const homePos = new WeakMap();  // node → { x, y }

// Scale factor: core defaults are for ForceGraph screen-space;
// simplify operates in ODGI data-space with much larger distances.
const SIMPLIFY_CHARGE_SCALE = 0.15;

// ---------------------------------------------------------------
// Simulation lifecycle
// ---------------------------------------------------------------

export function initForce() {
    if (sim) return;
    sim = d3.forceSimulation([])
        .alphaMin(0.001)
        .alpha(0)
        .alphaDecay(defaults.HEAT_DECAY)
        .velocityDecay(defaults.FRICTION)
        .force('link', d3.forceLink([]).id(d => d.iid).distance(d => d.length || 10).strength(defaults.LINK_STRENGTH))
        .force('charge', d3.forceManyBody().strength(defaults.CHARGE_STRENGTH * SIMPLIFY_CHARGE_SCALE).distanceMax(100))
        .force('collide', d3.forceCollide().radius(d => d.radius || 3).strength(defaults.COLLISION_STRENGTH).iterations(2))
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

    // Stash home positions for anchor forces.
    // Anchor nodes use their fixed position; others use ODGI layout centroid.
    for (const n of nodes) {
        homePos.set(n, { x: n.fx ?? n.x, y: n.fy ?? n.y });
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
    const remainingIds = new Set(remaining.map(n => n.iid));
    const remainingLinks = sim.force('link').links().filter(
        l => remainingIds.has(l.source.iid || l.source) && remainingIds.has(l.target.iid || l.target)
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
 * Release fixed positions and increase anchor strength to collapse nodes
 * back to their home positions. Call this on zoom-out before clearing.
 */
export function collapseToAnchors(strength = 0.5) {
    if (!sim || sim.nodes().length === 0) return;
    // Release fixed positions so anchor forces can pull nodes back
    for (const n of sim.nodes()) {
        if (n.fx != null) {
            n.x = n.fx;
            n.y = n.fy;
            delete n.fx;
            delete n.fy;
        }
    }
    sim.force('anchorX', d3.forceX(d => homePos.get(d)?.x ?? d.x).strength(strength));
    sim.force('anchorY', d3.forceY(d => homePos.get(d)?.y ?? d.y).strength(strength));
    sim.alpha(0.3).restart();
}

/**
 * Restore fixed positions on anchor nodes and reset anchor force strength.
 * Called when a collapse is cancelled (user zoomed back in).
 */
export function restoreAnchors() {
    if (!sim || sim.nodes().length === 0) return;
    for (const n of sim.nodes()) {
        if (!n.isAnchor) continue;
        const home = homePos.get(n);
        if (home) {
            n.fx = home.x;
            n.fy = home.y;
        }
    }
    sim.force('anchorX', d3.forceX(d => homePos.get(d)?.x ?? d.x).strength(0.05));
    sim.force('anchorY', d3.forceY(d => homePos.get(d)?.y ?? d.y).strength(0.05));
    sim.alpha(0.15).restart();
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
