// Ghost guide force: pulls visible nodes toward their assigned positions
// on the hidden ghost spine.
//
// Polychain nodes have ghostT (fixed point on ghost) — pulled to that exact spot.
// Popped segment nodes have ghostTStart/ghostTEnd (range) — pulled toward
// nearest point within that range, free to spread but constrained to the corridor.

import { getGhostSpine } from '../../data/polychain/polychain-adapter.js';
import { cumulativeLengths, interpolateAtDist } from '../../data/polychain/polychain-adapter.js';
import { pcSettings } from './pc-settings.js';

export function ghostGuideForce() {
    let nodes = [];

    // Cache ghost polylines per root to avoid recomputing every tick
    let _cachedGhosts = new Map(); // rootId → { pl, cumLen, totalLen }
    let _cacheTickCount = -1;

    function getGhostPolyline(rootId) {
        const ghostNodes = getGhostSpine(rootId);
        if (!ghostNodes || ghostNodes.length < 2) return null;

        let cached = _cachedGhosts.get(rootId);
        if (!cached) {
            cached = { pl: null, cumLen: null, totalLen: 0 };
            _cachedGhosts.set(rootId, cached);
        }

        // Rebuild every tick (ghost nodes move under forces)
        cached.pl = ghostNodes.map(n => [n.x, n.y]);
        cached.cumLen = cumulativeLengths(cached.pl);
        cached.totalLen = cached.cumLen[cached.cumLen.length - 1];
        return cached;
    }

    function force(alpha) {
        const k = (pcSettings.guideLevel ?? 0.01) * alpha;
        if (k === 0) return;

        // Invalidate cache each tick
        _cachedGhosts.clear();

        for (const node of nodes) {
            if (node.isGhostSpine) continue; // ghost is the target, not a follower

            const rootId = node.ghostRootId;
            if (!rootId) continue;

            const ghost = getGhostPolyline(rootId);
            if (!ghost || ghost.totalLen === 0) continue;

            let targetX, targetY;

            if (node.ghostT != null) {
                // Polychain node: pull to fixed t position
                const [tx, ty] = interpolateAtDist(ghost.pl, ghost.cumLen, node.ghostT * ghost.totalLen);
                targetX = tx;
                targetY = ty;
            } else if (node.ghostTStart != null && node.ghostTEnd != null) {
                // Popped segment node: find nearest point within [tStart, tEnd] range
                const tStart = node.ghostTStart;
                const tEnd = node.ghostTEnd;
                const dStart = tStart * ghost.totalLen;
                const dEnd = tEnd * ghost.totalLen;

                // Project node onto ghost polyline, clamp to range
                let bestDist = Infinity;
                let bestArcDist = dStart;
                const pl = ghost.pl;
                const cumLen = ghost.cumLen;
                for (let i = 0; i < pl.length - 1; i++) {
                    // Skip segments entirely outside the range
                    if (cumLen[i + 1] < dStart || cumLen[i] > dEnd) continue;

                    const ax = pl[i][0], ay = pl[i][1];
                    const bx = pl[i + 1][0], by = pl[i + 1][1];
                    const dx = bx - ax, dy = by - ay;
                    const lenSq = dx * dx + dy * dy;
                    let t = 0;
                    if (lenSq > 0) {
                        t = Math.max(0, Math.min(1, ((node.x - ax) * dx + (node.y - ay) * dy) / lenSq));
                    }
                    // Clamp arc distance to range
                    let arcDist = cumLen[i] + t * (cumLen[i + 1] - cumLen[i]);
                    arcDist = Math.max(dStart, Math.min(dEnd, arcDist));

                    const [px, py] = interpolateAtDist(pl, cumLen, arcDist);
                    const d = Math.hypot(node.x - px, node.y - py);
                    if (d < bestDist) {
                        bestDist = d;
                        bestArcDist = arcDist;
                    }
                }

                const [tx, ty] = interpolateAtDist(ghost.pl, ghost.cumLen, bestArcDist);
                targetX = tx;
                targetY = ty;

                // Softer pull for segments (they need room to spread)
                node.vx += (targetX - node.x) * k * 0.3;
                node.vy += (targetY - node.y) * k * 0.3;
                continue;
            } else {
                continue;
            }

            node.vx += (targetX - node.x) * k;
            node.vy += (targetY - node.y) * k;
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}
