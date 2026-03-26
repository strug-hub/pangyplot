// Polychain-specific D3 forces: loop shaping, inflation, and hierarchy.
// Each export is a factory function returning a D3-compatible force object.

import { pcSettings, inflationLevels, loopLevels } from './pc-settings.js';

/**
 * Grid-accelerated link-link repulsion for polychain links only.
 * Pushes nearby parallel polyline segments apart for smoother loops.
 * O(n) per tick via spatial hashing (vs O(n^2) brute force).
 */
export function polychainLinkRepulsion() {
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
export function intraChainRepulsion() {
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
export function centroidRepulsion() {
    let nodes = [];

    function force(alpha) {
        const str = (loopLevels[pcSettings.centroidLevel] ?? 0) * alpha;
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
 * Computes the head->tail vector, then each node gets a pull that
 * interpolates from +100% (toward tail) at the head end to -100%
 * (toward head) at the tail end. Middle nodes cancel out.
 * This curls chains into loops without distorting the interior.
 */
export function loopClosureForce() {
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

            // Head->tail vector
            const dx = tail.x - head.x;
            const dy = tail.y - head.y;
            const dist = Math.hypot(dx, dy) || 1;

            // loopFactor > 0.5: pull head->tail together (close the loop)
            // loopFactor < 0.5: push head->tail apart (straighten) — sigmoid decay with distance
            const sign = 2 * lf - 1;
            let scale;
            if (sign >= 0) {
                scale = sign;
            } else {
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
export function parentSideForce() {
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
 * Laplacian smoothing: nudges each interior polychain node toward
 * the midpoint of its two sequential neighbors along the chain.
 * F_i = k * (x[i-1] + x[i+1] - 2*x[i])
 * Smooths kinks without changing overall chain shape.
 */
export function laplacianSmoothing() {
    let nodes = [];

    function force(alpha) {
        const k = pcSettings.smoothing * alpha;
        if (k === 0) return;

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
            if (len < 3) continue;
            // Reduce smoothing on loops to avoid collapsing curvature,
            // but keep 30% so kinks on loops still get cleaned up
            const lf = group[0].loopFactor || 0;
            const scale = k * (1 - 0.7 * lf);
            if (scale < 1e-6) continue;
            group.sort((a, b) => a.nodeIndex - b.nodeIndex);

            for (let i = 1; i < len - 1; i++) {
                const prev = group[i - 1];
                const curr = group[i];
                const next = group[i + 1];
                curr.vx += scale * (prev.x + next.x - 2 * curr.x);
                curr.vy += scale * (prev.y + next.y - 2 * curr.y);
            }
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}

/**
 * Balloon inflation: pushes each polychain node outward along the
 * local curve normal via the signed-area gradient (active contour).
 * F_i = k * ((y[i+1] - y[i-1]) / 2, (x[i-1] - x[i+1]) / 2)
 * Inflates enclosed area while respecting local curvature.
 * Link springs provide the counterforce to reach equilibrium.
 */
export function balloonInflation() {
    let nodes = [];

    function force(alpha) {
        const k = pcSettings.inflate * alpha;
        if (k === 0) return;

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
            if (len < 3) continue;
            const lf = group[0].loopFactor || 0;
            if (lf === 0) continue;
            group.sort((a, b) => a.nodeIndex - b.nodeIndex);

            // Signed area (shoelace) to detect winding direction
            let signedArea = 0;
            for (let i = 0; i < len; i++) {
                const curr = group[i];
                const next = group[(i + 1) % len];
                signedArea += curr.x * next.y - next.x * curr.y;
            }
            // Positive = CCW (normals already outward), negative = CW (flip)
            const sign = signedArea >= 0 ? 1 : -1;
            const scale = k * lf * sign;

            // Interior nodes: central difference
            for (let i = 1; i < len - 1; i++) {
                const prev = group[i - 1];
                const curr = group[i];
                const next = group[i + 1];
                curr.vx += scale * (next.y - prev.y) * 0.5;
                curr.vy += scale * (prev.x - next.x) * 0.5;
            }

            // Endpoints: one-sided difference
            const head = group[0], h1 = group[1];
            head.vx += scale * (h1.y - head.y);
            head.vy += scale * (head.x - h1.x);

            const tail = group[len - 1], t1 = group[len - 2];
            tail.vx += scale * (tail.y - t1.y);
            tail.vy += scale * (t1.x - tail.x);
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}
