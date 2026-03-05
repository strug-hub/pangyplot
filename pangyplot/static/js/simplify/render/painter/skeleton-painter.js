// Skeleton LOD layer: polylines, junctions, gene-colored overdraw.

import { state } from '../../simplify-state.js';
import { getGenePins } from '../../render/annotation/gene-label-renderer.js';

/**
 * Draw skeleton polylines and junctions for the current LOD level.
 * Called inside data-space transform (ctx.translate + ctx.scale already applied).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} level       Current LOD level data
 * @param {number} li          Level index
 * @param {number} vpMinX      Viewport min X (with margin)
 * @param {number} vpMinY      Viewport min Y (with margin)
 * @param {number} vpMaxX      Viewport max X (with margin)
 * @param {number} vpMaxY      Viewport max Y (with margin)
 * @returns {{ visiblePl: number, visibleJ: number }}
 */
export function drawSkeleton(ctx, level, li, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const lineWidth = Math.max(0.5, 1.2 / state.zoom);
    const skelAlpha = state.detailData ? state.skeletonOpacity : 1;
    const hovSkel = state.hoveredSkeletonPl;
    const hasSkeletonHover = hovSkel && hovSkel.levelIdx === li;
    const hovChainId = hasSkeletonHover ? hovSkel.chainId : null;
    const hovFamily = hovChainId !== null && state.data.chainFamily
        ? state.data.chainFamily[hovChainId] : null;
    ctx.strokeStyle = `rgba(255, 255, 255, ${(hasSkeletonHover ? 0.3 : 0.75) * skelAlpha})`;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const bboxes = state.levelBboxes[li];
    const chainIds = level.chainIds;
    let visiblePl = 0;
    let visibleJ = 0;
    const genePins = getGenePins();
    const geneYMargin = (level.cellSize || 50) * 3;

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
        ctx.lineWidth = lineWidth;
    }

    // --- Gene-colored polylines (overdraw) ---
    if (genePins.length > 0) {
        ctx.strokeStyle = `rgba(232, 167, 53, ${skelAlpha})`;
        ctx.lineWidth = lineWidth * 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        for (let i = 0; i < level.polylines.length; i++) {
            const o = i * 4;
            if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
                bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;

            let inGene = false;
            for (const gene of genePins) {
                if (bboxes[o+2] >= gene.startX && bboxes[o] <= gene.endX &&
                    bboxes[o+3] >= gene.minY - geneYMargin && bboxes[o+1] <= gene.maxY + geneYMargin) {
                    inGene = true;
                    break;
                }
            }
            if (!inGene) continue;

            const pl = level.polylines[i];
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let j = 1; j < pl.length; j++) {
                ctx.lineTo(pl[j][0], pl[j][1]);
            }
        }
        ctx.stroke();
    }

    // --- Junctions (culled) ---
    const r = Math.max(1.5, 3.0 / state.zoom);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * skelAlpha})`;

    ctx.beginPath();
    for (const [x, y] of level.junctions) {
        if (x < vpMinX || x > vpMaxX || y < vpMinY || y > vpMaxY) continue;
        visibleJ++;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    // --- Gene-colored junctions (overdraw) ---
    if (genePins.length > 0) {
        const gr = Math.max(2, 4.0 / state.zoom);
        ctx.fillStyle = `rgba(232, 167, 53, ${skelAlpha})`;
        ctx.beginPath();
        for (const [x, y] of level.junctions) {
            if (x < vpMinX || x > vpMaxX || y < vpMinY || y > vpMaxY) continue;
            let inGene = false;
            for (const gene of genePins) {
                if (x >= gene.startX && x <= gene.endX &&
                    y >= gene.minY - geneYMargin && y <= gene.maxY + geneYMargin) {
                    inGene = true;
                    break;
                }
            }
            if (!inGene) continue;
            ctx.moveTo(x + gr, y);
            ctx.arc(x, y, gr, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    return { visiblePl, visibleJ };
}
