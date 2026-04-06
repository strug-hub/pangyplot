// Hover highlight overdraw on skeleton polylines.

import { state } from '../../state.js';
import { getChainFamily } from '../data/skeleton-data.js';
import { strokePolylines } from './skeleton-painter.js';

/**
 * Resolve the currently hovered chain's family set, or null if no hover.
 */
export function resolveHoverFamily() {
    const hovSkel = state.hoveredSkeletonPl;
    const hovChainId = hovSkel ? hovSkel.chainId : null;
    return hovChainId !== null ? getChainFamily(hovChainId) : null;
}

/**
 * Draw hover-highlighted polylines for the hovered chain family.
 */
export function drawHoverOverlay(ctx, level, visibleIndices, skelAlpha) {
    const hovFamily = resolveHoverFamily();
    if (!hovFamily) return;

    const hoverIndices = visibleIndices.filter(i => hovFamily.has(level.chainIds[i]));
    strokePolylines(ctx, level.polylines, hoverIndices, `rgba(91, 184, 240, ${skelAlpha})`, Math.max(2, 3 / state.zoom));
}
