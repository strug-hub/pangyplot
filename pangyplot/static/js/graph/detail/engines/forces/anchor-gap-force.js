// Anchor gap push: pushes popped content away from gap boundary anchors
// along the spine tangent direction, centering content in the gap.

import { getScale } from './pc-settings.js';

const EPSILON = 0.005;

export function anchorGapForce() {
    let nodes = [];

    function force(alpha) {
        const S = getScale();
        const strength = 2 * S * alpha;
        const maxDist = 100 * S;
        if (strength === 0) return;

        // Separate anchors and popped content nodes
        const anchors = [];
        const poppedNodes = [];
        for (const n of nodes) {
            if (n.isAnchor && n.simObject?.container) {
                anchors.push(n);
            } else if (n.popBubbleId && !n.isPolychainNode && !n.isAnchor) {
                poppedNodes.push(n);
            }
        }
        if (anchors.length === 0 || poppedNodes.length === 0) return;

        for (const anchor of anchors) {
            const seg = anchor.simObject;
            const container = seg.container;
            if (!container) continue;

            // Determine if this is a head or tail anchor
            const isHead = anchor === seg.headAnchor;
            const t = isHead ? seg.tRange.start : seg.tRange.end;

            // Compute spine tangent at this anchor's t-position
            const tA = Math.max(0, t - EPSILON);
            const tB = Math.min(1, t + EPSILON);
            const pA = container.positionAt(tA);
            const pB = container.positionAt(tB);
            let tx = pB.x - pA.x;
            let ty = pB.y - pA.y;
            const tLen = Math.hypot(tx, ty);
            if (tLen < 0.001) continue;
            tx /= tLen;
            ty /= tLen;

            // Push direction: head anchors push in negative-t (away from gap),
            // tail anchors push in positive-t (away from gap).
            // Wait — tail anchor is at the RIGHT edge of the LEFT segment,
            // so the gap is to the RIGHT → push content rightward = positive t.
            // Head anchor is at the LEFT edge of the RIGHT segment,
            // gap is to the LEFT → push content leftward = negative t.
            const pushX = isHead ? -tx : tx;
            const pushY = isHead ? -ty : ty;

            // Push nearby popped nodes
            for (const n of poppedNodes) {
                const dx = n.x - anchor.x;
                const dy = n.y - anchor.y;
                const dist = Math.hypot(dx, dy);
                if (dist > maxDist || dist < 0.01) continue;

                const falloff = 1 - dist / maxDist;
                n.vx += pushX * strength * falloff;
                n.vy += pushY * strength * falloff;
            }
        }
    }

    force.initialize = function(n) { nodes = n; };
    return force;
}
