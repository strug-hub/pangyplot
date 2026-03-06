// Skeleton LOD layer: polylines, junctions, hover highlight.
// Pure painting — no gene overlay logic.

import { state } from '../../simplify-state.js';
import { getLevelBboxes } from '../data/skeleton-data.js';
import { getChainFamily } from '../data/skeleton-data.js';

/**
 * Draw skeleton polylines and hover highlight.
 * @returns {{ visiblePl: number }}
 */
export function drawSkeletonPolylines(ctx, level, li, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const hovSkel = state.hoveredSkeletonPl;
    const hasSkeletonHover = hovSkel && hovSkel.levelIdx === li;
    const hovChainId = hasSkeletonHover ? hovSkel.chainId : null;
    const hovFamily = hovChainId !== null ? getChainFamily(hovChainId) : null;

    ctx.strokeStyle = `rgba(255, 255, 255, ${(hasSkeletonHover ? 0.3 : 0.75) * skelAlpha})`;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const bboxes = getLevelBboxes(li);
    const chainIds = level.chainIds;
    let visiblePl = 0;

    ctx.beginPath();
    for (let i = 0; i < level.polylines.length; i++) {
        const o = i * 4;
        if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
            bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;

        visiblePl++;
        if (hovFamily && hovFamily.has(chainIds[i])) continue;
        const pl = level.polylines[i];
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let j = 1; j < pl.length; j++) {
            ctx.lineTo(pl[j][0], pl[j][1]);
        }
    }
    ctx.stroke();

    // --- Hovered chain + descendants highlight ---
    if (hovFamily) {
        ctx.strokeStyle = `rgba(91, 184, 240, ${skelAlpha})`;
        ctx.lineWidth = Math.max(2, 3 / state.zoom);
        ctx.beginPath();
        for (let i = 0; i < level.polylines.length; i++) {
            if (!hovFamily.has(chainIds[i])) continue;
            const o = i * 4;
            if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
                bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;
            const pl = level.polylines[i];
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let j = 1; j < pl.length; j++) {
                ctx.lineTo(pl[j][0], pl[j][1]);
            }
        }
        ctx.stroke();
    }

    return { visiblePl };
}

/**
 * Draw skeleton junctions (culled white dots).
 * @returns {{ visibleJ: number }}
 */
export function drawSkeletonJunctions(ctx, level, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const r = Math.max(1.5, 3.0 / state.zoom);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * skelAlpha})`;

    let visibleJ = 0;
    ctx.beginPath();
    for (const [x, y] of level.junctions) {
        if (x < vpMinX || x > vpMaxX || y < vpMinY || y > vpMaxY) continue;
        visibleJ++;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    return { visibleJ };
}
