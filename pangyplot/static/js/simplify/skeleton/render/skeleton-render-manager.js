// Skeleton render pipeline: culling, orchestration.

import { state } from '../../simplify-state.js';
import { getLevel, getLevelBboxes } from '../data/skeleton-data.js';
import { drawBasePolylines, drawBaseJunctions } from './skeleton-base-overlay.js';
import { drawHoverOverlay } from './skeleton-hover-overlay.js';
import { drawGenePolylines, drawGeneJunctions } from './skeleton-gene-overlay.js';

/**
 * Draw the full skeleton layer for the current LOD level.
 * Called inside data-space transform (ctx.translate + ctx.scale already applied).
 *
 * Pipeline order:
 *   1. Base polylines (white, dimmed if hover)
 *   2. Hover highlight (blue, hovered family)
 *   3. Gene-colored polyline overdraw (orange)
 *   4. Base junctions (white dots)
 *   5. Gene-colored junction overdraw (orange dots)
 *
 * @returns {{ visiblePl: number, visibleJ: number }}
 */
export function drawSkeleton(ctx, vpMinX, vpMinY, vpMaxX, vpMaxY, svg = null) {
    const level = getLevel();
    if (!level) return { visiblePl: 0, visibleJ: 0 };

    const lineWidth = Math.max(0.5, 1.2 / state.zoom);
    const skelAlpha = state.detailData ? state.skeletonOpacity : 1;

    // --- Cull polylines by bbox ---
    const bboxes = getLevelBboxes();
    const visibleIndices = [];
    for (let i = 0; i < level.polylines.length; i++) {
        const o = i * 4;
        if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
            bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;
        visibleIndices.push(i);
    }

    // 1. Base polylines
    drawBasePolylines(ctx, level, visibleIndices, skelAlpha, lineWidth, svg);

    // 2. Hover highlight (skip during SVG export)
    if (!svg) drawHoverOverlay(ctx, level, visibleIndices, skelAlpha);

    // 3. Gene-colored polyline overdraw
    drawGenePolylines(ctx, level, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY, svg);

    // --- Cull junctions ---
    const visibleJunctions = [];
    for (const [x, y] of level.junctions) {
        if (x < vpMinX || x > vpMaxX || y < vpMinY || y > vpMaxY) continue;
        visibleJunctions.push([x, y]);
    }

    // 4. Base junctions
    drawBaseJunctions(ctx, visibleJunctions, skelAlpha, svg);

    // 5. Gene-colored junction overdraw
    drawGeneJunctions(ctx, level, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY, svg);

    return { visiblePl: visibleIndices.length, visibleJ: visibleJunctions.length };
}
