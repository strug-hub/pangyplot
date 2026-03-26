// D3-force simulation for popped chain subgraphs.
// Manages a single simulation containing all popped nodes+links.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { setForceNodes, setForceLinks } from '../data/force-data.js';
import simplifyViewState from '../data/simplify-view-state.js';
import defaults from '../../../graph/forces/settings/force-defaults.js';
import { getViewport } from '../../render/viewport.js';

// Simplify-specific overrides for bigger bubble loops
const SIMPLIFY_LINK_SCALE = 3;   // rest distance = link.length * this (vs 1 in core)
const SIMPLIFY_CHARGE = -80;     // reduced for polychain experiment (many more nodes)

// Polychain-specific tuning — mutable so UI sliders can update them
export const pcSettings = {
    charge: -20,              // global inter-node repulsion
    chargeMaxDist: 5000,      // long-range charge like core
    inflationLevel: 2,        // chain inflation level (0-5)
    centroidRepulsion: 4,     // push each node away from its chain's centroid (inflates loops)
    loopLevel: 2,             // loop pull level (0-5)
    collisionRadius: 5,       // node collision radius
    layoutLevel: 2,           // layout impulse level (0-5), matches core viewer
    linkStrength: 0.1,        // spring stiffness along polyline (softer = curvier)
    linkMinRest: 80,          // floor for link rest length (expands tight loops)
    linkRepulsion: 0.8,       // link-link perpendicular push strength
    linkRepulsionDist: 100,   // max distance for link-link repulsion
    linkRepulsionGrid: 50,    // grid cell size (~half of repulsion dist)
    parentSide: 2,            // push child chains to one side of parent
};

const inflationLevels = { 0: 0, 1: 500, 2: 2000, 3: 5000, 4: 10000, 5: 20000 };
const loopLevels = { 0: 0, 1: 1, 2: 4, 3: 10, 4: 25, 5: 50 };

let sim = null;

/**
 * Grid-accelerated link-link repulsion for polychain links only.
 * Pushes nearby parallel polyline segments apart for smoother loops.
 * O(n) per tick via spatial hashing (vs O(n²) brute force).
 */
function polychainLinkRepulsion() {
    let _links = [];

    function force(alpha) {
        if (_links.length < 2) return;
        const str = pcSettings.linkRepulsion * alpha;
        const cellSize = pcSettings.linkRepulsionGrid;
        const maxDist = pcSettings.linkRepulsionDist;

        // Build grid of link midpoints
        const grid = new Map();
        const mids = new Array(_links.length);

        for (let i = 0; i < _links.length; i++) {
            const l = _links[i];
            const s = l.source, t = l.target;
            if (s.x == null || t.x == null) { mids[i] = null; continue; }
            const mx = (s.x + t.x) * 0.5;
            const my = (s.y + t.y) * 0.5;
            mids[i] = { mx, my };
            const cx = Math.floor(mx / cellSize);
            const cy = Math.floor(my / cellSize);
            const key = (cx * 73856093) ^ (cy * 19349663); // spatial hash
            let bucket = grid.get(key);
            if (!bucket) { bucket = []; grid.set(key, bucket); }
            bucket.push(i);
        }

        // For each link, check its cell + 8 neighbors
        for (let i = 0; i < _links.length; i++) {
            const mi = mids[i];
            if (!mi) continue;
            const li = _links[i];
            const s1 = li.source, t1 = li.target;
            const cx = Math.floor(mi.mx / cellSize);
            const cy = Math.floor(mi.my / cellSize);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = ((cx + dx) * 73856093) ^ ((cy + dy) * 19349663);
                    const bucket = grid.get(key);
                    if (!bucket) continue;

                    for (const j of bucket) {
                        if (j <= i) continue; // avoid double-counting
                        const mj = mids[j];
                        if (!mj) continue;

                        const lj = _links[j];
                        // Skip consecutive links in same chain (they share a node)
                        if (li.chainId === lj.chainId) {
                            if (li.target === lj.source || li.source === lj.target) continue;
                        }

                        const ddx = mj.mx - mi.mx;
                        const ddy = mj.my - mi.my;
                        const dist = Math.hypot(ddx, ddy);
                        if (dist > maxDist || dist < 0.1) continue;

                        const push = str / (dist * dist);
                        const ux = ddx / dist * push;
                        const uy = ddy / dist * push;

                        s1.vx -= ux; s1.vy -= uy;
                        t1.vx -= ux; t1.vy -= uy;
                        const s2 = lj.source, t2 = lj.target;
                        s2.vx += ux; s2.vy += uy;
                        t2.vx += ux; t2.vy += uy;
                    }
                }
            }
        }
    }

    force.initialize = function() {};
    force.setLinks = function(links) {
        _links = links.filter(l => l.isPolychainLink);
    };
    return force;
}

/**
 * Intra-chain repulsion: extra charge between polychain nodes in the same chain.
 * Groups nodes by chainId, then applies pairwise repulsion within each group.
 * This inflates loops without pushing unrelated chains apart.
 */
function intraChainRepulsion() {
    let nodes = [];

    function force(alpha) {
        const str = (inflationLevels[pcSettings.inflationLevel] ?? 0) * alpha;
        if (str === 0) return;

        // Group polychain nodes by chain
        const chains = new Map();
        for (const n of nodes) {
            if (!n.isPolychainNode) continue;
            let group = chains.get(n.chainId);
            if (!group) { group = []; chains.set(n.chainId, group); }
            group.push(n);
        }

        for (const group of chains.values()) {
            const len = group.length;
            if (len < 2) continue;
            const lf = group[0].loopFactor || 0;
            if (lf === 0) continue;
            // Scale force down by group size so large chains don't explode
            const scale = str * lf / len;
            for (let i = 0; i < len; i++) {
                const a = group[i];
                for (let j = i + 1; j < len; j++) {
                    const b = group[j];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.max(1, Math.hypot(dx, dy));
                    const push = scale / (dist * dist);
                    const ux = dx / dist * push;
                    const uy = dy / dist * push;
                    a.vx -= ux; a.vy -= uy;
                    b.vx += ux; b.vy += uy;
                }
            }
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}

/**
 * Centroid repulsion: pushes each polychain node away from its chain's centroid.
 * Uniform outward pressure that inflates loops evenly. O(n) per tick.
 */
function centroidRepulsion() {
    let nodes = [];

    function force(alpha) {
        const str = pcSettings.centroidRepulsion * alpha;
        if (str === 0) return;

        // Group polychain nodes by chain and compute centroids
        const chains = new Map();
        for (const n of nodes) {
            if (!n.isPolychainNode) continue;
            let g = chains.get(n.chainId);
            if (!g) { g = { nodes: [], cx: 0, cy: 0 }; chains.set(n.chainId, g); }
            g.nodes.push(n);
            g.cx += n.x;
            g.cy += n.y;
        }

        for (const g of chains.values()) {
            const len = g.nodes.length;
            if (len < 3) continue;
            const lf = g.nodes[0].loopFactor || 0;
            if (lf === 0) continue;
            g.cx /= len;
            g.cy /= len;
            const s = str * lf;

            for (const n of g.nodes) {
                const dx = n.x - g.cx;
                const dy = n.y - g.cy;
                const dist = Math.hypot(dx, dy) || 1;
                n.vx += (dx / dist) * s;
                n.vy += (dy / dist) * s;
            }
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}

/**
 * Loop closure: magnetic pull along the chain.
 * Computes the head→tail vector, then each node gets a pull that
 * interpolates from +100% (toward tail) at the head end to -100%
 * (toward head) at the tail end. Middle nodes cancel out.
 * This curls chains into loops without distorting the interior.
 */
function loopClosureForce() {
    let nodes = [];

    function force(alpha) {
        const str = (loopLevels[pcSettings.loopLevel] ?? 0) * alpha;
        if (str === 0) return;

        const chains = new Map();
        for (const n of nodes) {
            if (!n.isPolychainNode) continue;
            let g = chains.get(n.chainId);
            if (!g) { g = []; chains.set(n.chainId, g); }
            g.push(n);
        }

        for (const group of chains.values()) {
            const len = group.length;
            if (len < 3) continue;
            const lf = group[0].loopFactor || 0;
            group.sort((a, b) => a.nodeIndex - b.nodeIndex);
            const head = group[0], tail = group[len - 1];

            // Head→tail vector
            const dx = tail.x - head.x;
            const dy = tail.y - head.y;
            const dist = Math.hypot(dx, dy) || 1;

            // loopFactor > 0.5: pull head→tail together (close the loop) — full strength
            // loopFactor < 0.5: push head→tail apart (straighten) — sigmoid decay with distance
            const sign = 2 * lf - 1;
            let scale;
            if (sign >= 0) {
                // Loop closure: full strength regardless of distance
                scale = sign;
            } else {
                // Linearization: sigmoid decay so long chains aren't overstretched
                const midpoint = 500;
                const distScale = 1 / (1 + (dist / midpoint) * (dist / midpoint));
                scale = sign * distScale;
            }
            const fx = dx / dist * str * scale;
            const fy = dy / dist * str * scale;

            for (const n of group) {
                const t = n.nodeIndex / (len - 1);
                const w = 1 - 2 * t;
                n.vx += fx * w;
                n.vy += fy * w;
            }
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}

/**
 * Parent-side force: pushes child chain nodes perpendicular to each ancestor polyline.
 * Each node has parentPerps[] — one entry per ancestor in the hierarchy.
 * Recomputes perpendiculars from current positions every ~20 ticks.
 */
function parentSideForce() {
    let nodes = [];
    let tickCount = 0;

    function recomputePerps() {
        // Group nodes by chainId, only chains with parentPerps
        const chains = new Map();
        for (const n of nodes) {
            if (!n.parentPerps) continue;
            let g = chains.get(n.chainId);
            if (!g) { g = []; chains.set(n.chainId, g); }
            g.push(n);
        }

        for (const group of chains.values()) {
            const perps = group[0].parentPerps;

            // Current centroid
            let cx = 0, cy = 0;
            for (const n of group) { cx += n.x; cy += n.y; }
            cx /= group.length; cy /= group.length;

            for (const p of perps) {
                const ppl = p.ppl;
                if (!ppl || ppl.length < 2) continue;

                let bestDist = Infinity, bestIdx = 0;
                for (let i = 0; i < ppl.length - 1; i++) {
                    const ax = ppl[i][0], ay = ppl[i][1];
                    const bx = ppl[i+1][0], by = ppl[i+1][1];
                    const dx = bx - ax, dy = by - ay;
                    const lenSq = dx * dx + dy * dy;
                    if (lenSq === 0) { const d = Math.hypot(cx - ax, cy - ay); if (d < bestDist) { bestDist = d; bestIdx = i; } continue; }
                    const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lenSq));
                    const d = Math.hypot(cx - (ax + t * dx), cy - (ay + t * dy));
                    if (d < bestDist) { bestDist = d; bestIdx = i; }
                }

                const ax = ppl[bestIdx][0], ay = ppl[bestIdx][1];
                const bx = ppl[bestIdx+1][0], by = ppl[bestIdx+1][1];
                const tx = bx - ax, ty = by - ay;
                const tLenSq = tx * tx + ty * ty;
                const tLen = Math.sqrt(tLenSq) || 1;
                const t = tLenSq > 0
                    ? Math.max(0, Math.min(1, ((cx - ax) * tx + (cy - ay) * ty) / tLenSq))
                    : 0;
                p.mx = ax + t * tx;
                p.my = ay + t * ty;
                p.px = -ty / tLen;
                p.py = tx / tLen;
                const dot = (cx - p.mx) * p.px + (cy - p.my) * p.py;
                if (dot < 0) { p.px = -p.px; p.py = -p.py; }
            }
        }
    }

    function force(alpha) {
        const str = pcSettings.parentSide * alpha;
        if (str === 0) return;

        // Recompute perpendiculars every 20 ticks
        if (++tickCount % 20 === 0) recomputePerps();

        for (const n of nodes) {
            if (!n.parentPerps) continue;
            for (let ai = 0; ai < n.parentPerps.length; ai++) {
                const p = n.parentPerps[ai];
                const depth = 1 / (ai + 1);  // 1, 1/2, 1/3, ...
                n.vx += p.px * str * depth;
                n.vy += p.py * str * depth;
            }
        }
    }
    force.initialize = function(n) { nodes = n; };
    return force;
}

/**
 * Combined layout pull — applies pcSettings.layoutLevel to polychain nodes,
 * standard layout strength to all other nodes. Replaces the shared layoutForce
 * so polychain nodes aren't pulled by both.
 */
function combinedLayoutForce() {
    let nodes = [];
    let standardLevel = 1;
    const standardStrengths = { 0: 0, 1: 0.0001, 2: 0.001, 3: 0.01, 4: 0.1, 5: 0.5 };

    function force(alpha) {
        const stdK = (standardStrengths[standardLevel] ?? 0) * alpha;
        const pcK = (standardStrengths[pcSettings.layoutLevel] ?? 0) * alpha;
        for (const node of nodes) {
            if (node.homeX == null) continue;
            const k = node.isPolychainNode ? pcK : stdK;
            node.vx += (node.homeX - node.x) * k;
            node.vy += (node.homeY - node.y) * k;
        }
    }

    force.initialize = function(n) { nodes = n; };
    force.strengthLevel = function(_) {
        if (_ == null) return standardLevel;
        standardLevel = +_;
        return force;
    };
    return force;
}

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
    sim.force('pcLinkRepulsion').setLinks(arr);
    setForceLinks(arr);
}

function getNodes() { return sim.nodes(); }
function getLinks() { return sim.force('link').links(); }

// ---------------------------------------------------------------
// Viewport freeze: pin off-screen nodes and zero their velocity
// to reduce simulation cost.  Uses _vpFrozen flag so we never
// interfere with other fx/fy uses (anchors, future user-pinning).
// ---------------------------------------------------------------
function viewportFreezeForce() {
    let _nodes = [];
    function force(/* alpha */) {
        if (!state.canvas) return;
        const vp = getViewport();
        // 50% margin on each side for soft falloff
        const mx = (vp.maxX - vp.minX) * 0.5;
        const my = (vp.maxY - vp.minY) * 0.5;
        const minX = vp.minX - mx, maxX = vp.maxX + mx;
        const minY = vp.minY - my, maxY = vp.maxY + my;

        for (let i = 0; i < _nodes.length; i++) {
            const n = _nodes[i];
            if (n.x == null) continue;
            const inside = n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY;
            if (inside) {
                if (n._vpFrozen) {
                    n.fx = null;
                    n.fy = null;
                    n._vpFrozen = false;
                }
            } else if (!n._vpFrozen && n.fx == null) {
                n.fx = n.x;
                n.fy = n.y;
                n._vpFrozen = true;
            }
            // Zero velocity on frozen nodes every tick to prevent
            // force accumulation from charge/collision on fixed nodes
            if (n._vpFrozen) {
                n.vx = 0;
                n.vy = 0;
            }
        }
    }
    force.initialize = (nodes) => { _nodes = nodes; };
    return force;
}

// ---------------------------------------------------------------
// Viewport-aware charge force: only builds quadtree from nodes
// near the viewport.  Drops from O(N log N) over 22K nodes to
// O(n log n) over the visible subset.
// ---------------------------------------------------------------
function viewportCharge() {
    let _nodes = [];
    let _str = () => SIMPLIFY_CHARGE;
    let _maxDist = () => 200;

    function force(alpha) {
        if (!state.canvas) return;
        const vp = getViewport();
        // Include nodes within charge max distance of viewport
        const pad = 5000;  // matches chargeMaxDist
        const minX = vp.minX - pad, maxX = vp.maxX + pad;
        const minY = vp.minY - pad, maxY = vp.maxY + pad;

        // Collect active (non-frozen) nodes near viewport
        const active = [];
        for (let i = 0; i < _nodes.length; i++) {
            const n = _nodes[i];
            if (n.x == null || n._vpFrozen) continue;
            if (n.x < minX || n.x > maxX || n.y < minY || n.y > maxY) continue;
            active.push(n);
        }
        if (active.length === 0) return;

        // Build quadtree only over active nodes
        const tree = d3.quadtree(active, n => n.x, n => n.y);

        for (let i = 0; i < active.length; i++) {
            const node = active[i];
            const s = typeof _str === 'function' ? _str(node) : _str;
            const md = typeof _maxDist === 'function' ? _maxDist(node) : _maxDist;
            const md2 = md * md;

            tree.visit((quad, x1, y1, x2, y2) => {
                if (!quad.length && quad.data !== node) {
                    const dx = node.x - quad.data.x;
                    const dy = node.y - quad.data.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < md2 && d2 > 0) {
                        const d = Math.sqrt(d2);
                        const k = s * alpha / d;
                        node.vx += dx * k / d;
                        node.vy += dy * k / d;
                    }
                }
                // Barnes-Hut: skip quad if too far
                const qx = (x1 + x2) / 2 - node.x;
                const qy = (y1 + y2) / 2 - node.y;
                const qd2 = qx * qx + qy * qy;
                const qw = x2 - x1;
                return qd2 > md2 || qw * qw / qd2 < 0.5;
            });
        }
    }
    force.initialize = (nodes) => { _nodes = nodes; };
    force.strength = (fn) => { _str = fn; return force; };
    force.distanceMax = (fn) => { _maxDist = fn; return force; };
    return force;
}

// ---------------------------------------------------------------
// Viewport-aware collide: only checks non-frozen nodes near viewport.
// ---------------------------------------------------------------
function viewportCollide() {
    let _nodes = [];
    let _radius = () => 5;
    let _strength = 0.7;
    let _iterations = 1;

    function force(/* alpha */) {
        if (!state.canvas) return;

        // Collect active (non-frozen) nodes
        const active = [];
        for (let i = 0; i < _nodes.length; i++) {
            const n = _nodes[i];
            if (n.x == null || n._vpFrozen) continue;
            active.push(n);
        }
        if (active.length < 2) return;

        for (let iter = 0; iter < _iterations; iter++) {
            const tree = d3.quadtree(active, n => n.x, n => n.y);

            for (let i = 0; i < active.length; i++) {
                const node = active[i];
                const ri = typeof _radius === 'function' ? _radius(node) : _radius;

                tree.visit((quad, x1, y1, x2, y2) => {
                    const data = quad.data;
                    if (data && data !== node) {
                        const rj = typeof _radius === 'function' ? _radius(data) : _radius;
                        const rSum = ri + rj;
                        let dx = node.x - data.x;
                        let dy = node.y - data.y;
                        let d2 = dx * dx + dy * dy;
                        if (d2 < rSum * rSum) {
                            let d = Math.sqrt(d2) || 1e-6;
                            const overlap = (rSum - d) * _strength * 0.5;
                            const ox = dx / d * overlap;
                            const oy = dy / d * overlap;
                            node.vx += ox;
                            node.vy += oy;
                            if (!data._vpFrozen) {
                                data.vx -= ox;
                                data.vy -= oy;
                            }
                        }
                    }
                    // Skip quad if too far for any possible collision
                    return x1 > node.x + ri || x2 < node.x - ri ||
                           y1 > node.y + ri || y2 < node.y - ri;
                });
            }
        }
    }
    force.initialize = (nodes) => { _nodes = nodes; };
    force.radius = (fn) => { _radius = fn; return force; };
    force.strength = (val) => { _strength = val; return force; };
    force.iterations = (val) => { _iterations = val; return force; };
    return force;
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
            .distance(d => d.isPolychainLink
                ? Math.max(pcSettings.linkMinRest, d.length)
                : d.length * SIMPLIFY_LINK_SCALE)
            .strength(d => d.isPolychainLink ? pcSettings.linkStrength : 0.05))
        .force('charge', viewportCharge()
            .strength(d => d.isPolychainNode ? pcSettings.charge : SIMPLIFY_CHARGE)
            .distanceMax(d => d.isPolychainNode ? pcSettings.chargeMaxDist : 200))
        .force('collide', viewportCollide()
            .radius(d => d.isPolychainNode ? pcSettings.collisionRadius : defaults.COLLISION_RADIUS)
            .strength(defaults.COLLISION_STRENGTH))
        .force('layout', combinedLayoutForce().strengthLevel(1))
        .force('intraChain', intraChainRepulsion())
        .force('centroid', centroidRepulsion())
        .force('loopClosure', loopClosureForce())
        .force('pcLinkRepulsion', polychainLinkRepulsion())
        .force('parentSide', parentSideForce())
        .force('delLink', delLinkForce())
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
        'intraChain', 'centroid', 'loopClosure', 'pcLinkRepulsion', 'parentSide'];
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
        'intraChain', 'centroid', 'loopClosure', 'pcLinkRepulsion', 'parentSide', 'delLink'];

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

    // Re-add the anchor↔phantom link, filtering out any links marked for removal
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
    sim.alpha(1).restart();
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
    sim.alpha(1).restart();
}

/**
 * Re-apply pcSettings to the live simulation forces and reheat.
 * Called by the UI sliders after mutating pcSettings.
 * D3 caches accessor results — we must re-set the accessors to force re-evaluation.
 */
export function applyPcSettings() {
    if (!sim) return;
    sim.force('charge')
        .strength(d => d.isPolychainNode ? pcSettings.charge : SIMPLIFY_CHARGE)
        .distanceMax(d => d.isPolychainNode ? pcSettings.chargeMaxDist : 200);
    sim.force('collide')
        .radius(d => d.isPolychainNode ? pcSettings.collisionRadius : defaults.COLLISION_RADIUS);
    sim.force('link')
        .distance(d => d.isPolychainLink
            ? Math.max(pcSettings.linkMinRest, d.length)
            : d.length * SIMPLIFY_LINK_SCALE)
        .strength(d => d.isPolychainLink ? pcSettings.linkStrength : 0);
    sim.alpha(1).restart();
}

export function isSimulating() {
    return sim && sim.alpha() > sim.alphaMin();
}

export function getAlpha() {
    return sim ? sim.alpha() : 0;
}

let _pausedAlpha = 0;

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
