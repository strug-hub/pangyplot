// Guide force: constrains popped segment nodes within a bounding ellipse
// around their pop's corridor on the parent chain.
//
// Each pop's children store neighbor bubble t values (guideLeftT, guideRightT).
// Every tick, the ellipse endpoints are interpolated along the live chain
// polyline, so the corridor tracks the chain's shape as it moves.
// No force inside the ellipse — nodes self-organize freely.
// Only pushes inward when a node drifts outside the boundary.

import { getPolychainNodesForChain, cumulativeLengths, interpolateAtDist } from '../../data/polychain/polychain-adapter.js';
import { pcSettings } from './pc-settings.js';

const SHORT_AXIS_RATIO = 0.15;

export function ghostGuideForce() {
    let nodes = [];

    // Cache chain polylines per tick
    let _chainCache = new Map();

    function getChainPl(chainId) {
        let cached = _chainCache.get(chainId);
        if (cached) return cached;
        const pcNodes = getPolychainNodesForChain(chainId);
        if (!pcNodes || pcNodes.length < 2) return null;
        const pl = pcNodes.map(n => [n.x, n.y]);
        const cumLen = cumulativeLengths(pl);
        const totalLen = cumLen[cumLen.length - 1];
        cached = { pl, cumLen, totalLen };
        _chainCache.set(chainId, cached);
        return cached;
    }

    function force(alpha) {
        const k = (pcSettings.guideLevel ?? 0.015) * alpha;
        if (k === 0) return;

        _chainCache.clear();

        for (const node of nodes) {
            if (node.isPolychainNode) continue;
            if (node.guideLeftT == null || node.guideRightT == null) continue;

            const chain = getChainPl(node.guideChainId);
            if (!chain || chain.totalLen === 0) continue;

            // Interpolate ellipse endpoints along the live chain
            const [ax, ay] = interpolateAtDist(chain.pl, chain.cumLen, node.guideLeftT * chain.totalLen);
            const [bx, by] = interpolateAtDist(chain.pl, chain.cumLen, node.guideRightT * chain.totalLen);

            const dx = bx - ax, dy = by - ay;
            const gapLen = Math.hypot(dx, dy);
            if (gapLen < 1) continue;

            const cx = (ax + bx) / 2, cy = (ay + by) / 2;
            const ux = dx / gapLen, uy = dy / gapLen;
            const vx = -uy, vy = ux;
            const a = gapLen / 2 + gapLen * 0.15;
            const b = Math.max(gapLen * SHORT_AXIS_RATIO, 10);

            const relX = node.x - cx, relY = node.y - cy;
            const u = relX * ux + relY * uy;
            const v = relX * vx + relY * vy;

            const eu = u / a, ev = v / b;
            const dist2 = eu * eu + ev * ev;

            if (dist2 <= 1) continue;

            const overshoot = Math.sqrt(dist2) - 1;
            const strength = k * Math.min(overshoot * 3, 1);

            node.vx -= relX * strength;
            node.vy -= relY * strength;
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}
