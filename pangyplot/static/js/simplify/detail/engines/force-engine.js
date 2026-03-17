// D3-force simulation for popped chain subgraphs.
// Manages a single simulation containing all popped nodes+links.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { setForceNodes, setForceLinks } from '../data/force-data.js';
import simplifyViewState from '../data/simplify-view-state.js';
import defaults from '../../../graph/forces/settings/force-defaults.js';
import layoutForce from '../../../graph/forces/layout-force.js';
import bubbleCircularForce from '../../../graph/forces/bubble-circular-force.js';

// Simplify-specific overrides for bigger bubble loops
const SIMPLIFY_LINK_SCALE = 3;   // rest distance = link.length * this (vs 1 in core)
const SIMPLIFY_CHARGE = -400;    // stronger repulsion (vs -200 in core)

let sim = null;

/**
 * Custom D3 force that pushes inside-bubble nodes perpendicularly away
 * from deletion links (source→sink bypasses).
 */
function delLinkForce() {
    let nodes = [];
    let strength = 2;

    function force(alpha) {
        const delLinks = sim.force('link').links().filter(l => l.isDel);
        for (const link of delLinks) {
            if (!link.bubbleId) continue;
            const s = link.source, t = link.target;
            // Self-link (b→b on same bubble): inside = intermediate kinks only
            // Cross-node link (parent deletion): inside = all chain siblings
            const isSelfLink = s.id === t.id;
            const inside = nodes.filter(n =>
                (isSelfLink ? n.id === s.id : n.chainId === s.chainId) &&
                n.iid !== s.iid && n.iid !== t.iid &&
                n !== s && n !== t
            );
            if (!inside.length) continue;

            // Perpendicular unit normal
            const dx = t.x - s.x, dy = t.y - s.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = dy / len, ny = -dx / len;

            // Centroid of inside nodes → pick consistent side
            let cx = 0, cy = 0;
            for (const n of inside) { cx += n.x; cy += n.y; }
            cx /= inside.length; cy /= inside.length;

            const A = t.y - s.y, B = -(t.x - s.x), C = t.x * s.y - t.y * s.x;
            const sign = (A * cx + B * cy + C) >= 0 ? 1 : -1;

            for (const n of inside) {
                n.vx += nx * strength * sign * alpha;
                n.vy += ny * strength * sign * alpha;
            }
        }
    }

    force.initialize = function(simNodes) { nodes = simNodes; };
    force.strength = function(_) { return arguments.length ? (strength = +_, force) : strength; };
    return force;
}

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
        .force('link', d3.forceLink([]).id(d => d.iid)
            .distance(d => d.length * SIMPLIFY_LINK_SCALE)
            .strength(d => d.isInterChain ? 0.3 : 1))
        .force('charge', d3.forceManyBody().strength(SIMPLIFY_CHARGE).distanceMax(defaults.CHARGE_DISTANCE))
        .force('collide', d3.forceCollide().radius(defaults.COLLISION_RADIUS).strength(defaults.COLLISION_STRENGTH))
        .force('layout', layoutForce().strengthLevel(defaults.LAYOUT_LEVEL))
        .force('bubbleRoundness', bubbleCircularForce())
        .force('delLink', delLinkForce())
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

/**
 * Rewire all links from a phantom node to a replacement node, then remove the phantom.
 * Returns the phantom node (for later restoration) or null.
 */
export function absorbPhantom(phantomIid, replacementNode) {
    if (!sim) return null;
    const nodes = getNodes();
    const phantom = nodes.find(n => n.iid === phantomIid);
    if (!phantom) return null;

    // Rewire links: replace phantom refs with replacement node
    for (const link of getLinks()) {
        if (link.source === phantom || link.source.iid === phantomIid) link.source = replacementNode;
        if (link.target === phantom || link.target.iid === phantomIid) link.target = replacementNode;
    }

    // Remove phantom node, self-links, and any links marked for removal
    const remaining = nodes.filter(n => n !== phantom);
    const remainingLinks = getLinks().filter(l => l.source !== l.target && !l._remove);
    syncNodes(remaining);
    syncLinks(remainingLinks);
    return phantom;
}

/**
 * Restore a previously absorbed phantom: re-add it and rewire links back.
 */
export function restorePhantom(phantom, anchorNode) {
    if (!sim || !phantom) return;

    // Re-add phantom
    const allNodes = [...getNodes(), phantom];
    syncNodes(allNodes);

    // Rewire inter-chain links from anchor back to phantom
    for (const link of getLinks()) {
        if (link.isInterChain && link.source === anchorNode) link.source = phantom;
        if (link.isInterChain && link.target === anchorNode) link.target = phantom;
    }

    // Re-add the anchor↔phantom link, filtering out any links marked for removal
    const allLinks = [...getLinks().filter(l => !l._remove), {
        source: anchorNode, target: phantom,
        isInterChain: true, isKinkLink: false, chainId: null, length: 10,
    }];
    syncLinks(allLinks);
    sim.alpha(0.1).restart();
}

export function removeLinksByFlag(flag) {
    if (!sim) return;
    const remaining = getLinks().filter(l => !l[flag]);
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
 * Removes all intra-chain links touching the parent; inter-chain links
 * (junction connectivity) are preserved by resolving endpoint seg IDs via viewState.
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

    // Separate inter-chain links touching the parent from intra-chain links
    const keptLinks = [];
    const interChainToRewire = [];
    for (const l of getLinks()) {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        const touchesParent = removeIids.has(sIid) || removeIids.has(tIid);
        if (!touchesParent) {
            keptLinks.push(l);
        } else if (l.isInterChain) {
            interChainToRewire.push(l);
        }
        // else: intra-chain link touching parent → dropped
    }

    // Rewire inter-chain links by resolving endpoint seg IDs through viewState.
    // This finds the current visual owner of the chain endpoint segment at any
    // bubble nesting depth, matching core's linkResolver pattern.
    for (const link of interChainToRewire) {
        const sIid = link.source.iid ?? link.source;
        const tIid = link.target.iid ?? link.target;
        if (removeIids.has(sIid) && link.sourceSegId) {
            const node = resolveSegToKink(link.sourceSegId, link.sourceStrand, allNodes);
            if (node) link.source = node;
            else continue;
        }
        if (removeIids.has(tIid) && link.targetSegId) {
            const node = resolveSegToKink(link.targetSegId, link.targetStrand, allNodes);
            if (node) link.target = node;
            else continue;
        }
        if (link.source !== link.target) {
            keptLinks.push(link);
        }
    }

    const allLinks = [...keptLinks, ...childLinks];

    syncNodes(allNodes);
    syncLinks(allLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(0.3).restart();
}

/**
 * Reverse of spliceBubbleNodes: remove child nodes and their links,
 * then add parent nodes + restored links (intra-kink + external).
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

    // Separate inter-chain links touching children from intra-chain links
    const keptLinks = [];
    const interChainToRewire = [];
    for (const l of getLinks()) {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        const touchesChild = removeIids.has(sIid) || removeIids.has(tIid);
        if (!touchesChild) {
            keptLinks.push(l);
        } else if (l.isInterChain) {
            interChainToRewire.push(l);
        }
    }

    for (const link of interChainToRewire) {
        const sIid = link.source.iid ?? link.source;
        const tIid = link.target.iid ?? link.target;
        if (removeIids.has(sIid) && link.sourceSegId) {
            const node = resolveSegToKink(link.sourceSegId, link.sourceStrand, allNodes);
            if (node) link.source = node;
            else continue;
        }
        if (removeIids.has(tIid) && link.targetSegId) {
            const node = resolveSegToKink(link.targetSegId, link.targetStrand, allNodes);
            if (node) link.target = node;
            else continue;
        }
        if (link.source !== link.target) {
            keptLinks.push(link);
        }
    }

    const allLinks = [...keptLinks, ...parentLinks];

    syncNodes(allNodes);
    syncLinks(allLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(0.3).restart();
}

/**
 * Resolve a chain endpoint seg ID to the correct kink node in the force sim.
 * Uses viewState to find the current visual owner (bubble record or null if
 * the segment is directly visible), then finds the matching kink among allNodes.
 * Strand selects head (first kink) vs tail (last kink).
 */
function resolveSegToKink(segId, strand, allNodes) {
    const record = simplifyViewState.resolve(segId);
    // If viewState maps to a record, the seg is inside a collapsed bubble
    const targetId = record ? record.id : `s${segId}`;

    // Find all kinks of this record in the node array, sorted by index
    const kinks = allNodes
        .filter(n => n.id === targetId)
        .sort((a, b) => (parseInt(a.iid.split('#')[1]) || 0) - (parseInt(b.iid.split('#')[1]) || 0));

    if (kinks.length === 0) return null;
    return strand === '+' ? kinks[kinks.length - 1] : kinks[0];
}

export function reheatSimulation() {
    if (!sim) return;
    sim.alpha(0.1).restart();
}

export function isSimulating() {
    return sim && sim.alpha() > sim.alphaMin();
}
