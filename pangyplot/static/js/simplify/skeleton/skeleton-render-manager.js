// Skeleton render pipeline: orchestrates polylines, junctions, hover, and gene overlay.

import { state } from '../simplify-state.js';
import { drawSkeletonPolylines, drawSkeletonJunctions } from './render/skeleton-painter.js';
import { drawGenePolylines, drawGeneJunctions } from './render/skeleton-gene-overlay.js';

/**
 * Draw the full skeleton layer for the current LOD level.
 * Called inside data-space transform (ctx.translate + ctx.scale already applied).
 *
 * Pipeline order:
 *   1. Base polylines (white)
 *   2. Hover highlight (blue, hovered family)
 *   3. Gene-colored polyline overdraw (orange)
 *   4. Base junctions (white dots)
 *   5. Gene-colored junction overdraw (orange dots)
 *
 * @returns {{ visiblePl: number, visibleJ: number }}
 */
export function drawSkeleton(ctx, level, li, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const lineWidth = Math.max(0.5, 1.2 / state.zoom);
    const skelAlpha = state.detailData ? state.skeletonOpacity : 1;

    // 1-2. Polylines + hover highlight
    const { visiblePl } = drawSkeletonPolylines(ctx, level, li, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY);

    // 3. Gene-colored polyline overdraw
    drawGenePolylines(ctx, level, li, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY);

    // 4. Junctions
    const { visibleJ } = drawSkeletonJunctions(ctx, level, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY);

    // 5. Gene-colored junction overdraw
    drawGeneJunctions(ctx, level, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY);

    return { visiblePl, visibleJ };
}
