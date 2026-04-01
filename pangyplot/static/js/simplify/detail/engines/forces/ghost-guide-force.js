// Guide force: constrains popped segment nodes within a bounding ellipse
// around their gap corridor on the parent chain.
//
// No force inside the ellipse — nodes self-organize freely via link springs.
// Only pushes inward when a node drifts outside the boundary.
// Long axis = anchorL→anchorR, short axis = fraction of gap length.

import { getChainGaps, getPolychainNodesForChain } from '../../data/polychain/polychain-adapter.js';
import { pcSettings } from './pc-settings.js';

const SHORT_AXIS_RATIO = 0.4;  // short axis = 40% of gap length

export function ghostGuideForce() {
    let nodes = [];

    // Cache ellipse params per gap (rebuilt each tick since anchors move)
    let _ellipses = null;

    function buildEllipses() {
        const map = new Map(); // chainId → [{ cx, cy, ux, uy, vx, vy, a, b }]
        // Scan all nodes that have guide ranges to find their chainIds
        const chainIds = new Set();
        for (const n of nodes) {
            if (n.ghostRootId) chainIds.add(n.ghostRootId);
        }
        for (const chainId of chainIds) {
            const gaps = getChainGaps(chainId);
            if (!gaps || gaps.length === 0) continue;
            const chainNodes = getPolychainNodesForChain(chainId);
            if (!chainNodes) continue;
            const ellipses = [];
            for (const g of gaps) {
                const ln = chainNodes[g.leftNodeIdx];
                const rn = chainNodes[g.rightNodeIdx];
                if (!ln || !rn) continue;
                const ax = ln.x, ay = ln.y;
                const bx = rn.x, by = rn.y;
                const cx = (ax + bx) / 2, cy = (ay + by) / 2;
                const dx = bx - ax, dy = by - ay;
                const gapLen = Math.hypot(dx, dy);
                if (gapLen < 1) continue;
                // Unit vectors: u = along gap, v = perpendicular
                const ux = dx / gapLen, uy = dy / gapLen;
                const vx = -uy, vy = ux;
                // Semi-axes: a = half gap length (+ padding), b = short axis
                const a = gapLen / 2 + gapLen * 0.15;
                const b = Math.max(gapLen * SHORT_AXIS_RATIO, 10);
                ellipses.push({ cx, cy, ux, uy, vx, vy, a, b, tStart: g.tStart, tEnd: g.tEnd });
            }
            if (ellipses.length > 0) map.set(chainId, ellipses);
        }
        return map;
    }

    function force(alpha) {
        const k = (pcSettings.guideLevel ?? 0.01) * alpha;
        if (k === 0) return;

        _ellipses = buildEllipses();

        for (const node of nodes) {
            if (node.isPolychainNode) continue;
            if (node.ghostTStart == null || node.ghostTEnd == null) continue;

            const chainId = node.ghostRootId;
            if (!chainId) continue;

            const ellipses = _ellipses.get(chainId);
            if (!ellipses) continue;

            // Find the ellipse matching this node's gap range
            const ellipse = ellipses.find(e => e.tStart === node.ghostTStart && e.tEnd === node.ghostTEnd);
            if (!ellipse) continue;

            const { cx, cy, ux, uy, vx, vy, a, b } = ellipse;

            // Transform node position to ellipse-local coords
            const relX = node.x - cx, relY = node.y - cy;
            const u = relX * ux + relY * uy;  // along gap axis
            const v = relX * vx + relY * vy;  // perpendicular

            // Normalized ellipse distance: (u/a)^2 + (v/b)^2
            const eu = u / a, ev = v / b;
            const dist2 = eu * eu + ev * ev;

            if (dist2 <= 1) continue; // inside ellipse — no force

            // Outside: push back toward ellipse boundary
            // Direction: from node toward the nearest point on the ellipse
            // Approximate: push radially toward center, scaled by overshoot
            const overshoot = Math.sqrt(dist2) - 1;  // 0 at boundary, grows outside
            const strength = k * Math.min(overshoot * 3, 1);  // soft ramp, caps at k

            // Push toward center (simple radial push)
            node.vx -= relX * strength;
            node.vy -= relY * strength;
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}
