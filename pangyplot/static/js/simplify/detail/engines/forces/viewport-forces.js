// Viewport-optimized D3 forces: freeze off-screen nodes, viewport-scoped
// charge and collision. No pcSettings dependency.

import { state } from '../../../simplify-state.js';
import { getViewport } from '../../../render/viewport.js';
import { SIMPLIFY_CHARGE } from './pc-settings.js';

/**
 * Viewport freeze: pin off-screen nodes and zero their velocity
 * to reduce simulation cost. Uses _vpFrozen flag so we never
 * interfere with other fx/fy uses (anchors, future user-pinning).
 */
export function viewportFreezeForce() {
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
            if (n._centroidAnchored) continue;
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

/**
 * Viewport-aware charge force: only builds quadtree from nodes
 * near the viewport. Drops from O(N log N) over 22K nodes to
 * O(n log n) over the visible subset.
 */
export function viewportCharge() {
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

/**
 * Viewport-aware collide: only checks non-frozen nodes near viewport.
 */
export function viewportCollide() {
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
