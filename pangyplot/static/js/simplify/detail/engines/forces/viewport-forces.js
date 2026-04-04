// Viewport-optimized D3 forces: freeze off-screen nodes, viewport-scoped
// charge and collision. No pcSettings dependency.

import { state } from '../../../simplify-state.js';
import { getViewport } from '../../../render/viewport.js';

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
