// Highlight rendering for selected and hovered force nodes.
// Three-tier highlight system: selection underlay
// (filled halos + thick links) rendered BEFORE nodes, hover outline AFTER.

import { state } from '../../state.js';
import { getForceLinks } from '../data/force-data.js';
import { fillCircles, strokeRing, strokeSegments } from './detail-painter.js';
import { colorState } from '../../color/color-state.js';
import { getNodeColor } from '../../color/color-style.js';

const HALO_THICKNESS = 2;
const HOVER_SIZE = 2.4;
const HOVER_THICKNESS = 0.3;

/**
 * Returns the visual selection state of a force node, in priority order.
 * @returns {'selected'|'multi-selected'|'hovered'|null}
 */
export function getNodeVisualState(node) {
    if (node === state.selectedNode) return 'selected';
    if (state.selectedObjects.size > 0 && node.simObject &&
        state.selectedObjects.has(node.simObject)) return 'multi-selected';
    if (node === state.hoveredForceNode || node === state.hoveredBubble) return 'hovered';
    return null;
}

/** Returns the fill color for a force node, accounting for multi-selection. */
export function getNodeFillColor(node) {
    if (getNodeVisualState(node) === 'multi-selected') return colorState.highlightColor;
    return getNodeColor(node);
}

// Dirty-check cache: stores link *references* (not coordinates),
// so positions update automatically as force nodes move.
let cachedNode = null;
let cachedLinks = [];

export function drawSelectionHighlight(ctx, scaleFactor, opacity, svg = null) {
    const selNode = state.selectedNode;
    if (!selNode || selNode.x == null) return;

    // Rebuild link reference cache on node change
    if (selNode !== cachedNode) {
        cachedNode = selNode;
        cachedLinks = [];
        for (const link of getForceLinks()) {
            if (link.source === selNode || link.target === selNode) {
                cachedLinks.push(link);
            }
        }
    }

    // Build segments from live positions each frame
    const segs = [];
    for (const link of cachedLinks) {
        const s = link.source, t = link.target;
        if (s.x != null && t.x != null) {
            segs.push({ x1: s.x, y1: s.y, x2: t.x, y2: t.y });
        }
    }

    // Draw link halos first (behind node halo)
    if (segs.length > 0) {
        strokeSegments(ctx, segs, colorState.selectedColor, HALO_THICKNESS * scaleFactor, opacity, svg);
    }

    // Draw node halo — filled circle larger than the node
    const r = HALO_THICKNESS * scaleFactor * 0.5;
    fillCircles(ctx, [{ x: selNode.x, y: selNode.y, r }], colorState.selectedColor, opacity, svg);
}

export function drawHoverHighlight(ctx, scaleFactor, opacity) {
    const hovNode = state.hoveredForceNode || state.hoveredBubble;
    if (!hovNode || hovNode.x == null) return;

    strokeRing(ctx, hovNode.x, hovNode.y,
        HOVER_SIZE * scaleFactor,
        colorState.hoverColor, HOVER_THICKNESS * scaleFactor, opacity);
}

export function clearSelectionCache() {
    cachedNode = null;
    cachedLinks = [];
}
