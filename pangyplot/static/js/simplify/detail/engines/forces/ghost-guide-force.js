// Guide force: gently pulls each popped node toward the nearest point
// on its parent chain's polyline. A soft shape hint that link forces
// can easily overcome.

import { getContainer } from '../../model/model-manager.js';
import { pcSettings } from './pc-settings.js';

export function ghostGuideForce() {
    let nodes = [];
    let _chainCache = new Map();

    function getChainPl(chainId) {
        let cached = _chainCache.get(chainId);
        if (cached) return cached;
        const pcNodes = getContainer(chainId)?.spineNodes;
        if (!pcNodes || pcNodes.length < 2) return null;
        // Only real polychain nodes — skip anchors to avoid feedback loop
        const real = pcNodes.filter(n => !n.isAnchor);
        if (real.length < 2) return null;
        cached = real.map(n => [n.x, n.y]);
        _chainCache.set(chainId, cached);
        return cached;
    }

    function force(alpha) {
        const k = (pcSettings.guideLevel ?? 0.015) * alpha;
        if (k === 0) return;

        _chainCache.clear();

        for (const node of nodes) {
            if (node.isPolychainNode) continue;
            const chainId = node.ghostRootId;
            if (!chainId) continue;

            const pl = getChainPl(chainId);
            if (!pl) continue;

            // Project node onto nearest point on chain polyline
            let bestDist = Infinity;
            let bestX = 0, bestY = 0;
            for (let i = 0; i < pl.length - 1; i++) {
                const ax = pl[i][0], ay = pl[i][1];
                const bx = pl[i+1][0], by = pl[i+1][1];
                const dx = bx - ax, dy = by - ay;
                const lenSq = dx * dx + dy * dy;
                let t = 0;
                if (lenSq > 0) {
                    t = Math.max(0, Math.min(1, ((node.x - ax) * dx + (node.y - ay) * dy) / lenSq));
                }
                const px = ax + t * dx, py = ay + t * dy;
                const d = Math.hypot(node.x - px, node.y - py);
                if (d < bestDist) {
                    bestDist = d;
                    bestX = px;
                    bestY = py;
                }
            }

            node.vx += (bestX - node.x) * k;
            node.vy += (bestY - node.y) * k;
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}
