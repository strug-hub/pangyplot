// D3-force simulation for popped chain subgraphs.
// Manages a single simulation containing all popped nodes+links.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { setForceNodes, setForceLinks } from '../data/force-data.js';
import defaults from '../../../graph/forces/settings/force-defaults.js';
import layoutForce from '../../../graph/forces/layout-force.js';
import bubbleCircularForce from '../../../graph/forces/bubble-circular-force.js';

let sim = null;

function syncNodes(arr) {
    sim.nodes(arr);
    setForceNodes(arr);
}

function syncLinks(arr) {
    sim.force('link').links(arr);
    setForceLinks(arr);
}

function getNodes() { return sim.nodes(); }
function getLinks() { return sim.force('link').links(); }

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

    const allNodes = [...getNodes(), ...nodes];
    const allLinks = [...getLinks(), ...links];

    syncNodes(allNodes);
    syncLinks(allLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);

    sim.alpha(0.3).restart();
}

export function removePoppedNodes(chainId) {
    if (!sim) return;

    const remaining = getNodes().filter(n => n.chainId !== chainId);
    const remainingIds = new Set(remaining.map(n => n.iid));
    const remainingLinks = getLinks().filter(
        l => remainingIds.has(l.source.iid || l.source) && remainingIds.has(l.target.iid || l.target)
    );

    syncNodes(remaining);
    syncLinks(remainingLinks);

    if (remaining.length > 0) {
        sim.alpha(0.1).restart();
    } else {
        sim.stop();
    }
}

export function addInterChainLinks(links) {
    if (!sim) return;

    const allLinks = [...getLinks(), ...links];
    syncLinks(allLinks);
    sim.alpha(0.1).restart();
}

export function removeInterChainLinks() {
    if (!sim) return;

    const remaining = getLinks().filter(l => !l.isInterChain);
    syncLinks(remaining);
}

export function clearForce() {
    if (!sim) return;
    sim.stop();
    syncNodes([]);
    syncLinks([]);
}

export function collapseToAnchors() {
    if (!sim || getNodes().length === 0) return;
    for (const n of getNodes()) {
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
    if (!sim || getNodes().length === 0) return;
    for (const n of getNodes()) {
        if (!n.isAnchor) continue;
        if (n.homeX != null) {
            n.fx = n.homeX;
            n.fy = n.homeY;
        }
    }
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(0.15).restart();
}

/**
 * Atomically remove parent bubble nodes and splice in child nodes+links.
 * Removes ALL links touching the parent; the pop response's GFA links
 * provide all new connectivity (no rewiring).
 * @param {Set<string>} removeIids - iids of the parent bubble kink nodes to remove
 * @param {Array} childNodes - new nodes to add
 * @param {Array} childLinks - new links to add
 */
export function spliceBubbleNodes(removeIids, childNodes, childLinks) {
    if (!sim) initForce();

    for (const n of childNodes) {
        n.homeX = n.fx ?? n.x;
        n.homeY = n.fy ?? n.y;
    }

    // Remove parent nodes, add children
    const remaining = getNodes().filter(n => !removeIids.has(n.iid));
    const allNodes = [...remaining, ...childNodes];

    // Remove all links touching parent nodes
    const existingLinks = getLinks().filter(l => {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        return !removeIids.has(sIid) && !removeIids.has(tIid);
    });

    const allLinks = [...existingLinks, ...childLinks];

    syncNodes(allNodes);
    syncLinks(allLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(0.3).restart();
}

/**
 * Reverse of spliceBubbleNodes: remove child nodes and their links,
 * then add parent nodes + restored links (intra-kink + external).
 * @param {Set<string>} removeIids - iids of child nodes to remove
 * @param {Array} parentNodes - parent bubble kink nodes to re-add
 * @param {Array} parentLinks - parent's intra-kink links + saved external links
 */
export function unspliceBubbleNodes(removeIids, parentNodes, parentLinks) {
    if (!sim) return;

    for (const n of parentNodes) {
        n.homeX = n.fx ?? n.x;
        n.homeY = n.fy ?? n.y;
    }

    // Remove child nodes
    const remaining = getNodes().filter(n => !removeIids.has(n.iid));
    const allNodes = [...remaining, ...parentNodes];

    // Remove all links touching child nodes
    const existingLinks = getLinks().filter(l => {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        return !removeIids.has(sIid) && !removeIids.has(tIid);
    });

    const allLinks = [...existingLinks, ...parentLinks];

    syncNodes(allNodes);
    syncLinks(allLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(0.3).restart();
}

export function reheatSimulation() {
    if (!sim) return;
    sim.alpha(0.1).restart();
}

export function isSimulating() {
    return sim && sim.alpha() > sim.alphaMin();
}
