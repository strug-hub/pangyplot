// D3-force simulation orchestrator for popped chain subgraphs.
// Manages a single simulation: wires forces from sub-modules,
// handles node/link mutations, and controls simulation lifecycle.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { setForceNodes, setForceLinks } from '../data/force-data.js';
import simplifyViewState from '../data/simplify-view-state.js';
import defaults from '../../../graph/forces/settings/force-defaults.js';

// Settings (re-exported so existing importers don't break)
export { pcSettings } from './forces/pc-settings.js';
import { pcSettings, SIMPLIFY_LINK_SCALE, SIMPLIFY_CHARGE, linkStrengthLevels } from './forces/pc-settings.js';

// Force factories
import { viewportFreezeForce } from './forces/viewport-forces.js';
import { centroidRepulsion,
         loopClosureForce, parentSideForce, laplacianSmoothing,
         balloonInflation } from './forces/polychain-forces.js';
import { combinedLayoutForce, delLinkForce } from './forces/layout-forces.js';

// ---------------------------------------------------------------
// Simulation state
// ---------------------------------------------------------------

let sim = null;
let _pausedAlpha = 0;

// ---------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------

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
// Link accessors (shared between initForce and applyPcSettings)
// ---------------------------------------------------------------

function linkDistance(d) {
    return d.isPolychainLink ? d.length : d.length * SIMPLIFY_LINK_SCALE;
}

const LINK_SOFTEN_MIDPOINT = 100000;

function linkStrength(d) {
    if (!d.isPolychainLink) return 0.01;
    const base = linkStrengthLevels[pcSettings.linkStrengthLevel] ?? 0.1;
    const arc = d.chainArcLen || 0;
    return base / (1 + (arc / LINK_SOFTEN_MIDPOINT) * (arc / LINK_SOFTEN_MIDPOINT));
}

function chargeStrength(d) {
    return d.isPolychainNode ? pcSettings.charge : SIMPLIFY_CHARGE;
}

function chargeMaxDist(d) {
    return d.isPolychainNode ? pcSettings.chargeMaxDist : 200;
}

function collideRadius(d) {
    return d.isPolychainNode ? pcSettings.collisionRadius : defaults.COLLISION_RADIUS;
}

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
        .force('vpFreeze', viewportFreezeForce())
        .force('link', d3.forceLink([]).id(d => d.iid)
            .distance(linkDistance)
            .strength(linkStrength))
        .force('charge', d3.forceManyBody()
            .strength(chargeStrength)
            .distanceMax(400))
        // .force('collide', d3.forceCollide()
        //     .radius(collideRadius)
        //     .strength(defaults.COLLISION_STRENGTH))
        .force('layout', combinedLayoutForce().strengthLevel(1))
        .force('centroid', centroidRepulsion())
        .force('loopClosure', loopClosureForce())
        .force('smoothing', laplacianSmoothing())
        .force('balloon', balloonInflation())
        .force('parentSide', parentSideForce())
        .force('delLink', delLinkForce(getLinks))
        .on('tick', onTick);
    sim.stop();
}

/**
 * Compute per-force velocity deltas by running each force individually.
 * Called on demand by the debug renderer (not every tick).
 */
export function computeForceDeltas() {
    if (!sim) return {};
    const nodes = sim.nodes();
    if (nodes.length === 0) return {};

    const alpha = 1; // Use full strength for debug visualization
    const forceNames = ['charge', 'collide', 'link', 'layout',
        'centroid', 'loopClosure', 'smoothing', 'balloon', 'parentSide'];
    const result = {};

    for (const name of forceNames) {
        const force = sim.force(name);
        if (!force) continue;

        // Snapshot
        for (const n of nodes) { n._pvx = n.vx; n._pvy = n.vy; }

        // Run just this force
        force(alpha);

        // Capture delta and restore
        const map = new Map();
        for (const n of nodes) {
            const dvx = n.vx - n._pvx;
            const dvy = n.vy - n._pvy;
            if (dvx !== 0 || dvy !== 0) {
                map.set(n, { fx: dvx, fy: dvy });
            }
            // Restore vx/vy so we don't double-apply
            n.vx = n._pvx;
            n.vy = n._pvy;
        }
        result[name] = map;
    }

    return result;
}

function onTick() {
    if (state.detailPhase !== 'none' && state.detailPhase !== 'fading-out') {
        scheduleFrame();
    }
}

/** Profile per-force cost (debug utility). */
export function profileForces() {
    if (!sim) return;
    const nodes = sim.nodes();
    const alpha = sim.alpha();
    const allForces = ['vpFreeze', 'charge', 'collide', 'link', 'layout',
        'centroid', 'loopClosure', 'smoothing', 'balloon', 'parentSide', 'delLink'];

    console.log(`Profiling ${nodes.length} nodes, alpha=${alpha.toFixed(4)}`);
    const frozen = nodes.filter(n => n._vpFrozen).length;
    console.log(`  frozen: ${frozen}, active: ${nodes.length - frozen}`);

    for (const name of allForces) {
        const f = sim.force(name);
        if (!f) continue;
        // Snapshot velocities
        for (const n of nodes) { n._pvx = n.vx; n._pvy = n.vy; }
        const t0 = performance.now();
        f(alpha);
        const dt = performance.now() - t0;
        // Restore velocities
        for (const n of nodes) { n.vx = n._pvx; n.vy = n._pvy; }
        console.log(`  ${name}: ${dt.toFixed(2)}ms`);
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

    sim.alpha(1).restart();
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
        sim.alpha(1).restart();
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

    // Re-add the anchor<->phantom link, filtering out any links marked for removal
    const allLinks = [...getLinks().filter(l => !l._remove), {
        source: anchorNode, target: phantom,
        isInterChain: true, isKinkLink: false, chainId: null, length: 10,
    }];
    syncLinks(allLinks);
    sim.alpha(1).restart();
}

export function removeLinksByFlag(flag) {
    if (!sim) return;
    const remaining = getLinks().filter(l => !l[flag]);
    syncLinks(remaining);
}

/**
 * Surgically remove all force nodes and links belonging to a set of chain IDs.
 * Also removes phantom nodes and junction links associated with those chains.
 */
export function removeNodesByChainIds(chainIds) {
    if (!sim) return;

    const remaining = getNodes().filter(n => {
        // Remove nodes belonging to the chain
        if (chainIds.has(n.chainId)) return false;
        // Remove phantom nodes for these chains
        if (n.isPhantom && chainIds.has(n.phantomChainId)) return false;
        return true;
    });

    const remainingIids = new Set(remaining.map(n => n.iid));
    const remainingLinks = getLinks().filter(l => {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        return remainingIids.has(sIid) && remainingIids.has(tIid);
    });

    syncNodes(remaining);
    syncLinks(remainingLinks);

    if (remaining.length > 0) {
        sim.alpha(1).restart();
    } else {
        sim.stop();
    }
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
    sim.alpha(1).restart();
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
    sim.alpha(1).restart();
}

/**
 * Atomically remove parent bubble nodes and splice in child nodes+links.
 * Removes all intra-chain links touching the parent; inter-chain links
 * (junction connectivity) are preserved by resolving endpoint seg IDs via viewState.
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

    const allLinks = [...keptLinks, ...childLinks];

    syncNodes(allNodes);
    syncLinks(allLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(1).restart();
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

    const remaining = getNodes().filter(n => !removeIids.has(n.iid));
    const allNodes = [...remaining, ...parentNodes];

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
    sim.alpha(1).restart();
}

/**
 * Resolve a chain endpoint seg ID to the correct kink node in the force sim.
 */
function resolveSegToKink(segId, strand, allNodes) {
    const record = simplifyViewState.resolve(segId);
    const targetId = record ? record.id : `s${segId}`;

    const kinks = allNodes
        .filter(n => n.id === targetId)
        .sort((a, b) => (parseInt(a.iid.split('#')[1]) || 0) - (parseInt(b.iid.split('#')[1]) || 0));

    if (kinks.length === 0) return null;
    return strand === '+' ? kinks[kinks.length - 1] : kinks[0];
}

// ---------------------------------------------------------------
// Simulation control
// ---------------------------------------------------------------

export function reheatSimulation() {
    if (!sim) return;
    sim.alpha(1).restart();
}

/**
 * Re-apply pcSettings to the live simulation forces and reheat.
 * Called by the UI sliders after mutating pcSettings.
 * Uses the same accessor functions as initForce to stay in sync.
 */
export function applyPcSettings() {
    if (!sim) return;
    const charge = sim.force('charge');
    if (charge) charge.strength(chargeStrength).distanceMax(chargeMaxDist);
    const collide = sim.force('collide');
    if (collide) collide.radius(collideRadius);
    const link = sim.force('link');
    if (link) link.distance(linkDistance).strength(linkStrength);
    sim.alpha(1).restart();
}

export function isSimulating() {
    return sim && sim.alpha() > sim.alphaMin();
}

export function getAlpha() {
    return sim ? sim.alpha() : 0;
}

export function pauseSim() {
    if (!sim) return;
    _pausedAlpha = sim.alpha();
    sim.stop();
}

export function resumeSim() {
    if (!sim || _pausedAlpha <= sim.alphaMin()) return;
    sim.alpha(_pausedAlpha).restart();
    _pausedAlpha = 0;
}
