// Gene-colored overdraw on skeleton polylines and junctions, plus label positioning.

import { state } from '../../simplify-state.js';
import { getLevelBboxes } from '../data/skeleton-data.js';
import { getGenePins } from '../data/gene-data.js';
import { strokePolylines, fillJunctions, drawGeneLabel } from './skeleton-painter.js';

/**
 * Draw gene-colored polyline overdraw on visible skeleton polylines.
 */
export function drawGenePolylines(ctx, level, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const bboxes = getLevelBboxes();
    const geneYMargin = (level.gridSize || 50) * 3;

    const geneIndices = [];
    for (let i = 0; i < level.polylines.length; i++) {
        const o = i * 4;
        if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
            bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;

        for (const gene of genePins) {
            if (bboxes[o+2] >= gene.startX && bboxes[o] <= gene.endX &&
                bboxes[o+3] >= gene.minY - geneYMargin && bboxes[o+1] <= gene.maxY + geneYMargin) {
                geneIndices.push(i);
                break;
            }
        }
    }

    if (geneIndices.length === 0) return;
    strokePolylines(ctx, level.polylines, geneIndices, `rgba(232, 167, 53, ${skelAlpha})`, lineWidth * 2);
}

/**
 * Draw gene-colored junction overdraw on visible skeleton junctions.
 */
export function drawGeneJunctions(ctx, level, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const geneYMargin = (level.gridSize || 50) * 3;

    const geneJunctions = [];
    for (const [x, y] of level.junctions) {
        if (x < vpMinX || x > vpMaxX || y < vpMinY || y > vpMaxY) continue;
        for (const gene of genePins) {
            if (x >= gene.startX && x <= gene.endX &&
                y >= gene.minY - geneYMargin && y <= gene.maxY + geneYMargin) {
                geneJunctions.push([x, y]);
                break;
            }
        }
    }

    if (geneJunctions.length === 0) return;
    const gr = Math.max(2, 4.0 / state.zoom);
    fillJunctions(ctx, geneJunctions, gr, `rgba(232, 167, 53, ${skelAlpha})`);
}

/**
 * Compute screen-space label positions and draw gene labels.
 */
export function drawGeneLabelOverlay(ctx, cw) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    for (const gene of genePins) {
        const sxStart = gene.startX * state.zoom + state.panX;
        const sxEnd = gene.endX * state.zoom + state.panX;
        if (sxEnd < -60 || sxStart > cw + 60) continue;
        const sxMid = (sxStart + sxEnd) / 2;
        const syRef = gene.refY * state.zoom + state.panY;
        drawGeneLabel(ctx, gene.name, sxStart, sxEnd, sxMid, syRef);
    }
}
