// Dedicated force simulation for polychain nodes.
// Separate from the junction force sim — polychains get their own
// charge, link springs, link-link repulsion, and layout pull.

import { scheduleFrame } from '../../../utils/frame-scheduler.js';
import { state } from '../../../state.js';

// --- Tuning ---
const CHARGE = -30;             // inter-node repulsion (pushes loops outward)
const CHARGE_MAX_DIST = 150;    // limit charge range to nearby nodes
const LINK_DISTANCE_SCALE = 1;  // rest length = arc-length * this
const LINK_STRENGTH = 1.5;      // spring stiffness along polyline
const LAYOUT_STRENGTH = 0.0005; // gentle pull toward ODGI home positions
const LINK_REPULSION = 0.8;     // link-link perpendicular push strength
const LINK_REPULSION_DIST = 60; // max distance for link-link repulsion
const FRICTION = 0.15;
const ALPHA_DECAY = 0.005;

let sim = null;
let polychainNodes = [];
let polychainLinks = [];

// ---------------------------------------------------------------
// Link-link repulsion force
// ---------------------------------------------------------------

function linkLinkRepulsion() {
    let _links = [];

    function force(alpha) {
        const n = _links.length;
        if (n < 2) return;

        const str = LINK_REPULSION * alpha;

        for (let i = 0; i < n; i++) {
            const li = _links[i];
            const s1 = li.source, t1 = li.target;
            if (s1.x == null || t1.x == null) continue;

            // Midpoint + direction of link i
            const mx1 = (s1.x + t1.x) * 0.5;
            const my1 = (s1.y + t1.y) * 0.5;

            for (let j = i + 1; j < n; j++) {
                const lj = _links[j];
                // Skip links in the same chain that are sequential
                // (they share a node and shouldn't repel)
                if (li.chainId === lj.chainId) {
                    if (li.target === lj.source || li.source === lj.target) continue;
                }

                const s2 = lj.source, t2 = lj.target;
                if (s2.x == null || t2.x == null) continue;

                const mx2 = (s2.x + t2.x) * 0.5;
                const my2 = (s2.y + t2.y) * 0.5;

                const dx = mx2 - mx1;
                const dy = my2 - my1;
                const dist = Math.hypot(dx, dy);

                if (dist > LINK_REPULSION_DIST || dist < 0.1) continue;

                // Repulsive push inversely proportional to distance
                const push = str / (dist * dist);
                const ux = dx / dist * push;
                const uy = dy / dist * push;

                // Apply to all 4 endpoints
                s1.vx -= ux; s1.vy -= uy;
                t1.vx -= ux; t1.vy -= uy;
                s2.vx += ux; s2.vy += uy;
                t2.vx += ux; t2.vy += uy;
            }
        }
    }

    force.initialize = function() {};
    force.links = function(_) {
        if (!arguments.length) return _links;
        _links = _;
        return force;
    };
    return force;
}

// ---------------------------------------------------------------
// Layout pull (toward ODGI home positions)
// ---------------------------------------------------------------

function polychainLayoutForce() {
    let nodes = [];

    function force(alpha) {
        const k = LAYOUT_STRENGTH * alpha;
        for (const node of nodes) {
            if (node.homeX == null) continue;
            node.vx += (node.homeX - node.x) * k;
            node.vy += (node.homeY - node.y) * k;
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}

// ---------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------

function onTick() {
    if (state.detailPhase !== 'none' && state.detailPhase !== 'fading-out') {
        scheduleFrame();
    }
}

export function initPolychainForce() {
    if (sim) return;
    sim = d3.forceSimulation([])
        .alphaMin(0.001)
        .alpha(0)
        .alphaDecay(ALPHA_DECAY)
        .velocityDecay(FRICTION)
        .force('link', d3.forceLink([]).id(d => d.iid)
            .distance(d => (d.length || 1) * LINK_DISTANCE_SCALE)
            .strength(LINK_STRENGTH))
        .force('charge', d3.forceManyBody()
            .strength(CHARGE)
            .distanceMax(CHARGE_MAX_DIST))
        .force('layout', polychainLayoutForce())
        // linkRepulsion disabled — O(n²) too expensive for 1000+ links.
        // TODO: spatial grid to check only nearby link pairs.
        // .force('linkRepulsion', linkLinkRepulsion())
        .on('tick', onTick);
    sim.stop();
}

export function addPolychainNodes(nodes, links) {
    if (!sim) initPolychainForce();

    polychainNodes = [...polychainNodes, ...nodes];
    polychainLinks = [...polychainLinks, ...links];

    sim.nodes(polychainNodes);
    sim.force('link').links(polychainLinks);

    sim.alpha(0.3).restart();
}

export function removePolychainNodes(chainIds) {
    if (!sim) return;

    const removeSet = new Set(chainIds);
    polychainNodes = polychainNodes.filter(n => !removeSet.has(n.chainId));
    polychainLinks = polychainLinks.filter(l => {
        const sChain = l.source.chainId ?? l.source;
        const tChain = l.target.chainId ?? l.target;
        return !removeSet.has(sChain) && !removeSet.has(tChain);
    });

    sim.nodes(polychainNodes);
    sim.force('link').links(polychainLinks);

    if (polychainNodes.length > 0) {
        sim.alpha(0.1).restart();
    } else {
        sim.stop();
    }
}

export function clearPolychainForce() {
    if (!sim) return;
    sim.stop();
    polychainNodes = [];
    polychainLinks = [];
    sim.nodes([]);
    sim.force('link').links([]);
    sim.force('linkRepulsion').links([]);
}

export function reheatPolychainForce() {
    if (!sim || polychainNodes.length === 0) return;
    sim.alpha(0.15).restart();
}
