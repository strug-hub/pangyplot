// D3-force simulation orchestrator for popped chain subgraphs.
// Manages a single simulation: wires forces from sub-modules,
// handles node/link mutations, and controls simulation lifecycle.

import { state } from '../../state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { setForceNodes, setForceLinks } from '../data/force-data.js';
import defaults from '../force-defaults.js';

// Settings (re-exported so existing importers don't break)
export { pcSettings } from './forces/pc-settings.js';
import { pcSettings, LINK_SCALE, DEFAULT_CHARGE, linkStrengthLevels, getScale } from './forces/pc-settings.js';

// Force factories
import { viewportFreezeForce } from './forces/viewport-forces.js';
import { centroidRepulsion,
         loopClosureForce, parentSideForce, laplacianSmoothing,
         balloonInflation } from './forces/polychain-forces.js';
import { combinedLayoutForce, delLinkForce } from './forces/layout-forces.js';
import { chainGuideForce } from './forces/chain-guide-force.js';
import { anchorGapForce } from './forces/anchor-gap-force.js';
import { centroidAnchorForce, releaseAllChains } from '../../engines/drag/centroid-anchor-force.js';
import { updateAnchors as updateModelAnchors } from '../model/model-manager.js';

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

export function linkDistance(d) {
    if (d.isPolychainLink) return d.length;
    if (d.isBridgeLink) return 10;
    if (d.class === 'link' && d.chainId && d.chainId !== '__junction__') return 10;
    return d.length * LINK_SCALE;
}

const LINK_SOFTEN_MIDPOINT = 100000;

export function linkStrength(d) {
    if (d.isPolychainLink || d.isKinkLink) {
        // Anchor links: zero strength — guide force positions anchors
        const s = d.source, t = d.target;
        if ((s && s.isAnchor) || (t && t.isAnchor)) return 0.5;
        const base = linkStrengthLevels[pcSettings.linkStrengthLevel] ?? 0.1;
        const arc = d.chainArcLen || 0;
        return base / (1 + (arc / LINK_SOFTEN_MIDPOINT) * (arc / LINK_SOFTEN_MIDPOINT));
    }
    if (d.isBridgeLink) return 0.1;
    if (d.class === 'link' && d.chainId && d.chainId !== '__junction__') return 0.5;
    return 0.01;
}

// Tick counter for spawn damping
let _tickCount = 0;
const SPAWN_DAMP_TICKS = 18;

function chargeStrength(d) {
    return pcSettings.charge;
}

/**
 * Create a pair of isolated many-body forces: one for polychain nodes,
 * one for popped segment nodes.  Each group repels within itself but
 * the two groups don't interact with each other.
 */
function isolatedCharge(filterFn, strengthFn, maxDist) {
    // Strength returns 0 for non-group nodes so they don't act as charge sources
    const inner = d3.forceManyBody()
        .strength(d => filterFn(d) ? strengthFn() : 0)
        .distanceMax(maxDist);
    let allNodes = [];
    let targetNodes = [];

    function force(alpha) {
        // Save velocities for nodes NOT in this group
        const saved = [];
        for (const n of allNodes) {
            if (!filterFn(n)) saved.push({ n, vx: n.vx, vy: n.vy });
        }
        inner(alpha);
        // Restore — force never happened for non-group nodes
        for (const { n, vx, vy } of saved) {
            n.vx = vx;
            n.vy = vy;
        }
    }

    force.initialize = function(nodes, random) {
        allNodes = nodes;
        inner.initialize(nodes, random);
    };
    force.strength = function(_) { return _ == null ? inner.strength() : (inner.strength(_), force); };
    force.distanceMax = function(_) { return _ == null ? inner.distanceMax() : (inner.distanceMax(_), force); };
    return force;
}

/**
 * Custom force that dampens velocity on recently spawned nodes.
 * D3's forceManyBody caches strength per node, so we can't ramp charge
 * via the accessor. Instead, we counteract the charge impulse by scaling
 * down vx/vy on young nodes each tick.
 */
function spawnDampingForce() {
    let nodes = [];
    function force(/* alpha */) {
        for (const n of nodes) {
            if (n._spawnTick == null) continue;
            const age = _tickCount - n._spawnTick;
            if (age >= SPAWN_DAMP_TICKS) {
                n._spawnTick = null;
                continue;
            }
            // Scale down velocity: 0 at birth, full at SPAWN_DAMP_TICKS
            const scale = age / SPAWN_DAMP_TICKS;
            n.vx *= scale;
            n.vy *= scale;
        }
    }
    force.initialize = function(n) { nodes = n; };
    return force;
}

// --- Exported force parameter functions (single source of truth for force + debug UI) ---

export function chargeMaxDist(d) {
    const S = getScale();
    if (d.isPolychainNode) return 400 * S;
    return 100 * S;  // popped segments
}

export function chargeStr(d) {
    const S = getScale();
    if (d.isPolychainNode) return pcSettings.charge * S;
    return -20 * S;  // popped segments
}

function collideRadius(d) {
    const S = getScale();
    return (d.isPolychainNode ? pcSettings.collisionRadius : defaults.COLLISION_RADIUS) * S;
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
        .force('charge', isolatedCharge(
            n => n.isPolychainNode,
            () => chargeStr({ isPolychainNode: true }),
            chargeMaxDist({ isPolychainNode: true })))
        .force('segCharge', isolatedCharge(
            n => !n.isPolychainNode && n.chainId,
            () => chargeStr({ isPolychainNode: false }),
            chargeMaxDist({ isPolychainNode: false })))
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
        .force('chainGuide', chainGuideForce())
        .force('anchorGap', anchorGapForce())
        .force('centroidAnchor', centroidAnchorForce())
        .force('spawnDamp', spawnDampingForce())
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
    const forceNames = ['charge', 'segCharge', 'collide', 'link', 'layout',
        'centroid', 'loopClosure', 'smoothing', 'balloon', 'parentSide',
        'delLink', 'chainGuide', 'anchorGap', 'centroidAnchor', 'spawnDamp'];
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
    _tickCount++;
    updateModelAnchors();  // snap SimObject anchors to spine positions
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

/**
 * Atomically replace a chain's polychain nodes and links in the force sim.
 * Rewires any bridge/inter-chain links that referenced the old head or tail
 * to the corresponding new head or tail.
 */

/**
 * Add child nodes + links to the running simulation.
 */
export function insertPoppedContent(chainId, childNodes, childLinks) {
    if (!sim) initForce();

    for (const n of childNodes) {
        if (n.homeX == null) n.homeX = n.fx ?? n.x;
        if (n.homeY == null) n.homeY = n.fy ?? n.y;
        n._spawnTick = _tickCount;
    }

    const allNodes = [...getNodes(), ...childNodes];
    const allLinks = [...getLinks(), ...childLinks];

    syncNodes(allNodes);
    syncLinks(allLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(1).restart();
}

/**
 * Remove nodes by iid and any links touching them.
 */
export function removePoppedContent(childIids) {
    if (!sim) return;

    const childSet = new Set(childIids);
    const remaining = getNodes().filter(n => !childSet.has(n.iid));
    const remainingIids = new Set(remaining.map(n => n.iid));
    const keptLinks = getLinks().filter(l => {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        return remainingIids.has(sIid) && remainingIids.has(tIid);
    });

    syncNodes(remaining);
    syncLinks(keptLinks);
    sim.force('layout').strengthLevel(defaults.LAYOUT_LEVEL);
    sim.alpha(1).restart();
}

/**
 * Remove all nodes (and their links) whose chainId is in the given set.
 */
export function removeNodesByChainIds(chainIds) {
    if (!sim) return;
    const remaining = getNodes().filter(n => !chainIds.has(n.chainId));
    const remainingIids = new Set(remaining.map(n => n.iid));
    const keptLinks = getLinks().filter(l => {
        const sIid = l.source.iid ?? l.source;
        const tIid = l.target.iid ?? l.target;
        return remainingIids.has(sIid) && remainingIids.has(tIid);
    });
    syncNodes(remaining);
    syncLinks(keptLinks);
}

// Simulation control
// ---------------------------------------------------------------

export function reheatSimulation() {
    if (!sim) return;
    sim.alpha(1).restart();
}

export function reheatDrag() {
    if (!sim) return;
    sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
}

export function registerCustomForce(name, forceFn) {
    if (!sim) initForce();
    sim.force(name, forceFn);
}

/**
 * Re-apply pcSettings to the live simulation forces and reheat.
 * Called by the UI sliders after mutating pcSettings.
 * Uses the same accessor functions as initForce to stay in sync.
 */
export function applyPcSettings() {
    if (!sim) return;
    const charge = sim.force('charge');
    if (charge) charge.strength(d => d.isPolychainNode ? chargeStr(d) : 0)
        .distanceMax(chargeMaxDist({ isPolychainNode: true }));
    const collide = sim.force('collide');
    if (collide) collide.radius(collideRadius);
    const link = sim.force('link');
    if (link) link.distance(linkDistance).strength(linkStrength);
    sim.alpha(1).restart();
}

/** Clear all nodes and links from the force simulation. */
export function clearForce() {
    if (!sim) return;
    syncNodes([]);
    syncLinks([]);
    sim.stop();
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
