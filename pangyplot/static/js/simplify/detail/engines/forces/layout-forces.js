// Layout and structural D3 forces: position pull and deletion-link push.

import { pcSettings } from './pc-settings.js';

/**
 * Combined layout pull — applies pcSettings.layoutLevel to polychain nodes,
 * standard layout strength to all other nodes. Replaces the shared layoutForce
 * so polychain nodes aren't pulled by both.
 */
export function combinedLayoutForce() {
    let nodes = [];
    let standardLevel = 1;
    const standardStrengths = { 0: 0, 1: 0.0001, 2: 0.001, 3: 0.01, 4: 0.1, 5: 0.5 };

    function force(alpha) {
        const k = (standardStrengths[pcSettings.layoutLevel] ?? 0) * alpha;
        if (k === 0) return;
        for (const node of nodes) {
            if (node.homeX == null) continue;
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
 * from deletion links (source->sink bypasses).
 *
 * @param {Function} getLinks - callback returning current sim links,
 *   injected by the orchestrator to avoid circular sim dependency.
 */
export function delLinkForce(getLinks) {
    let nodes = [];
    let strength = 2;

    function force(alpha) {
        const delLinks = getLinks().filter(l => l.isDel);
        for (const link of delLinks) {
            if (!link.bubbleId) continue;
            const s = link.source, t = link.target;
            // Self-link (b->b on same bubble): inside = intermediate kinks only
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

            // Centroid of inside nodes -> pick consistent side
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
