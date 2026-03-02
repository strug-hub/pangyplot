// Painting for popped chain subgraphs — reuses core pangyplot color system
// and drawing primitives, adapted for simplify's canvas transform + zoom.

import { state } from './simplify-state.js';
import { drawCircle, drawLine } from '../graph/render/painter/painter-utils.js';
import { colorState } from '../graph/render/color/color-state.js';

// ---------------------------------------------------------------
// Color helpers (match core app's "node_type" default mode)
// ---------------------------------------------------------------

function nodeColor(type) {
    switch (type) {
        case 'segment': return colorState.nodeColors[0];  // blue
        case 'bubble':  return colorState.nodeColors[1];  // yellow
        case 'chain':   return colorState.nodeColors[2];  // orange
        default:        return colorState.nullColor;
    }
}

function linkColor() {
    return colorState.linkColor;  // gray
}

// ---------------------------------------------------------------
// Public painters
// ---------------------------------------------------------------

/**
 * Paint a single node (circle) using core app style.
 * node shape: { x, y, width, type, seqLength }
 * width is pre-computed in detail.js from seqLength.
 */
export function paintNode(ctx, node) {
    const w = node.width / state.zoom;
    const color = nodeColor(node.type);
    ctx.globalAlpha = 0.85 * state.detailOpacity;
    drawCircle(ctx, node.x, node.y, w, color);
}

/**
 * Paint a single link using core app style.
 * link shape: { source: {x,y}, target: {x,y}, isKinkLink }
 * Kink links: thick, colored by node type (sausage body).
 * Inter-bubble links: thin gray connectors.
 */
export function paintLink(ctx, link) {
    const src = link.source;
    const tgt = link.target;
    if (src.x == null || tgt.x == null) return;

    if (link.isKinkLink) {
        const w = Math.max(1, 5 / state.zoom);
        const color = nodeColor(src.type || tgt.type);
        ctx.globalAlpha = 0.85 * state.detailOpacity;
        drawLine(ctx, src.x, src.y, tgt.x, tgt.y, w, color);
    } else {
        const w = Math.max(0.5, 1.5 / state.zoom);
        ctx.globalAlpha = 0.5 * state.detailOpacity;
        drawLine(ctx, src.x, src.y, tgt.x, tgt.y, w, linkColor());
    }
}
