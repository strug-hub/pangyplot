// D3-force simulation for popped chain subgraphs.
// Manages a single simulation containing all popped nodes+links.

import { state } from '../simplify-state.js';
import { scheduleFrame } from '../render/render-manager.js';
import defaults from '../../graph/forces/settings/force-defaults.js';
import layoutForce from '../../graph/forces/layout-force.js';
import bubbleCircularForce from '../../graph/forces/bubble-circular-force.js';

let sim = null;

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
        .force('link', d3.forceLink([]).id(d => d.iid).distance(d => d.length * defaults.LINK_STRENGTH))
        .force('charge', d3.forceManyBody().strength(defaults.CHARGE_STRENGTH).distanceMax(defaults.CHARGE_DISTANCE))
        .force('collide', d3.forceCollide().radius(defaults.COLLISION_RADIUS).strength(defaults.COLLISION_STRENGTH))
        .force('layout', layoutForce().strengthLevel(defaults.LAYOUT_LEVEL))
        .force('bubbleRoundness', bubbleCircularForce())
        .on('tick', onTick);
    sim.stop();
}

function onTick() {
    if (state.detailPhase !== 'none' && state.detailPhase !== 'fading-out') {
        scheduleFrame();
    }
}

// ---------------------------------------------------------------
// Add/remove popped chain nodes
// ---------------------------------------------------------------

export function addPoppedNodes(nodes, links) {
    if (!sim) initForce();

    for (const n of nodes) {
        n.homeX = n.fx ?? n.x;
        n.homeY = n.fy ?? n.y;
    }

    const allNodes = [...sim.nodes(), ...nodes];
    const allLinks = [...sim.force('link').links(), ...links];

    sim.nodes(allNodes);
    sim.force('link').links(allLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);

    sim.alpha(0.3).restart();
}

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

export function addInterChainLinks(links) {
    if (!sim) return;

    const allLinks = [...sim.force('link').links(), ...links];
    sim.force('link').links(allLinks);
    sim.alpha(0.1).restart();
}

export function removeInterChainLinks() {
    if (!sim) return;

    const remaining = sim.force('link').links().filter(l => !l.isInterChain);
    sim.force('link').links(remaining);
}

export function clearForce() {
    if (!sim) return;
    sim.stop();
    sim.nodes([]);
    sim.force('link').links([]);
}

export function collapseToAnchors() {
    if (!sim || sim.nodes().length === 0) return;
    for (const n of sim.nodes()) {
        if (n.fx != null) {
            n.x = n.fx;
            n.y = n.fy;
            delete n.fx;
            delete n.fy;
        }
    }
    sim.force('layout').strengthLevel(5);
    sim.alpha(0.3).restart();
}

export function restoreAnchors() {
    if (!sim || sim.nodes().length === 0) return;
    for (const n of sim.nodes()) {
        if (!n.isAnchor) continue;
        if (n.homeX != null) {
            n.fx = n.homeX;
            n.fy = n.homeY;
        }
    }
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(0.15).restart();
}

export function getForceNodes() {
    return sim ? sim.nodes() : [];
}

export function getForceLinks() {
    return sim ? sim.force('link').links() : [];
}

export function isSimulating() {
    return sim && sim.alpha() > sim.alphaMin();
}
