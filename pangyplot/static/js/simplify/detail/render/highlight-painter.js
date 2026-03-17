// Highlight rendering for selected and hovered force nodes.
// Matches core viewer's three-tier highlight system: selection underlay
// (filled halos + thick links) rendered BEFORE nodes, hover outline AFTER.

import { state } from '../../simplify-state.js';
import { getForceLinks } from '../data/force-data.js';
import { fillCircles, strokeRing, strokeSegments } from './detail-painter.js';

// Colors matching core's color-state.js
const HOVER_COLOR = '#aca9a6';
const SELECTED_COLOR = '#F44336';

// Sizes matching core's highlight-selection-renderer.js
const HALO_THICKNESS = 10;
const HOVER_SIZE = 12;
const HOVER_THICKNESS = 1.5;

// Dirty-check cache: stores link *references* (not coordinates),
// so positions update automatically as force nodes move.
let cachedNode = null;
let cachedLinks = [];

export function drawSelectionHighlight(ctx, scaleFactor, opacity) {
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
        strokeSegments(ctx, segs, SELECTED_COLOR, HALO_THICKNESS * scaleFactor, opacity);
    }

    // Draw node halo — filled circle larger than the node
    const r = HALO_THICKNESS * scaleFactor * 0.5;
    fillCircles(ctx, [{ x: selNode.x, y: selNode.y, r }], SELECTED_COLOR, opacity);
}

export function drawHoverHighlight(ctx, scaleFactor, opacity) {
    const hovNode = state.hoveredForceNode || state.hoveredBubble;
    if (!hovNode || hovNode.x == null) return;

    strokeRing(ctx, hovNode.x, hovNode.y,
        HOVER_SIZE * scaleFactor,
        HOVER_COLOR, HOVER_THICKNESS * scaleFactor, opacity);
}

export function clearSelectionCache() {
    cachedNode = null;
    cachedLinks = [];
}
