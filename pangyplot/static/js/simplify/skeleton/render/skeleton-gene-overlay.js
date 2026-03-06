// Gene-colored overdraw on skeleton polylines and junctions.

import { state } from '../../simplify-state.js';
import { getGenePins } from '../../render/annotation/gene-label-renderer.js';

/**
 * Draw gene-colored polyline overdraw on visible skeleton polylines.
 */
export function drawGenePolylines(ctx, level, li, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const bboxes = state.levelBboxes[li];
    const geneYMargin = (level.gridSize || 50) * 3;

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

/**
 * Draw gene-colored junction overdraw on visible skeleton junctions.
 */
export function drawGeneJunctions(ctx, level, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const geneYMargin = (level.gridSize || 50) * 3;
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
