// Painting for popped chain subgraphs -- reuses core pangyplot color system
// and drawing primitives, adapted for simplify's canvas transform + zoom.

import { state } from '../../simplify-state.js';
import { drawCircle, drawLine } from '../../../graph/render/painter/painter-utils.js';
import { getNodeColor, getLinkColor } from '../../../graph/render/color/color-style.js';

// ---------------------------------------------------------------
// Public painters
// ---------------------------------------------------------------

/**
 * Paint a single node (circle) using core app color system.
 */
export function paintNode(ctx, node) {
    const w = node.width / state.zoom;
    const color = getNodeColor(node);
    ctx.globalAlpha = 0.85 * state.detailOpacity;
    drawCircle(ctx, node.x, node.y, w, color);
}

/**
 * Paint a single link using core app color system.
 */
export function paintLink(ctx, link) {
    const src = link.source;
    const tgt = link.target;
    if (src.x == null || tgt.x == null) return;

    if (link.isKinkLink) {
        const w = Math.max(1, 5 / state.zoom);
        const color = getNodeColor(src);
        ctx.globalAlpha = 0.85 * state.detailOpacity;
        drawLine(ctx, src.x, src.y, tgt.x, tgt.y, w, color);
    } else {
        const w = Math.max(0.5, 1.5 / state.zoom);
        ctx.globalAlpha = 0.5 * state.detailOpacity;
        drawLine(ctx, src.x, src.y, tgt.x, tgt.y, w, getLinkColor(link));
    }
}
