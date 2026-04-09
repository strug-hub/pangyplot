// Highlight rendering for selected and hovered force nodes.
// Selection is handled via fill color (getNodeFillColor),
// hover is rendered as an outline ring after nodes.

import { state } from '../../state.js';
import { strokeRing } from './detail-painter.js';
import { colorState } from '../../color/color-state.js';
import { getNodeColor } from '../../color/color-style.js';

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

/** Returns the fill color for a force node, accounting for selection. */
export function getNodeFillColor(node) {
    const vs = getNodeVisualState(node);
    if (vs === 'selected' || vs === 'multi-selected') return colorState.highlightColor;
    return getNodeColor(node);
}

export function drawHoverHighlight(ctx, scaleFactor, opacity) {
    const hovNode = state.hoveredForceNode || state.hoveredBubble;
    if (!hovNode || hovNode.x == null) return;

    strokeRing(ctx, hovNode.x, hovNode.y,
        HOVER_SIZE * scaleFactor,
        colorState.hoverColor, HOVER_THICKNESS * scaleFactor, opacity);
}
