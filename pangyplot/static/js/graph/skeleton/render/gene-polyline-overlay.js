// Gene-colored polyline overdraw on skeleton polylines.

import { state } from '../../state.js';
import { getLevelBboxes } from '../data/skeleton-data.js';
import { getGenePins, isGeneVisible } from '@graph-data/gene-data.js';
import { strokePolylinesClipX } from './skeleton-painter.js';
import { strokePolylinesSvgClipX } from '../../render/svg-utils.js';
import { hexToRgba } from '@color-utils';
import { getPinnedGenes } from './gene-label-overlay.js';

// Precomputed spatial index: gene name → polyline indices.
// Viewport-independent — rebuilt only when LOD or gene positions change.
let genePinVersion = 0;
let polylineCache = null;  // { lod, pinVer, data: Map<name, number[]> }

export function bumpGenePinVersion() { genePinVersion++; }

function buildPolylineIndex(level, bboxes) {
    const pinnedCount = getPinnedGenes().size;
    if (polylineCache && polylineCache.lod === state.currentLOD &&
        polylineCache.pinVer === genePinVersion &&
        polylineCache.pinnedCount === pinnedCount) {
        return polylineCache.data;
    }

    const genePins = getGenePins();
    const pinnedGenes = getPinnedGenes();
    const geneYMargin = (level.gridSize || 50) * 3;
    const data = new Map();

    for (const gene of genePins) {
        if (!isGeneVisible(gene.name)) continue;
        if (!pinnedGenes.has(gene.name)) continue;
        const indices = [];
        for (let i = 0; i < level.polylines.length; i++) {
            const o = i * 4;
            if (bboxes[o+2] >= gene.startX && bboxes[o] <= gene.endX &&
                bboxes[o+3] >= gene.minY - geneYMargin && bboxes[o+1] <= gene.maxY + geneYMargin) {
                indices.push(i);
            }
        }
        if (indices.length > 0) data.set(gene.name, indices);
    }

    polylineCache = { lod: state.currentLOD, pinVer: genePinVersion, pinnedCount: pinnedCount, data };
    return data;
}

/**
 * Draw gene-colored polyline overdraw on visible skeleton polylines.
 */
export function drawGenePolylines(ctx, level, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY, svg = null) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const bboxes = getLevelBboxes();
    const index = buildPolylineIndex(level, bboxes);
    if (index.size === 0) return;

    for (const gene of genePins) {
        const indices = index.get(gene.name);
        if (!indices) continue;
        if (svg) {
            strokePolylinesSvgClipX(svg, level.polylines, indices,
                hexToRgba(gene.color, skelAlpha), lineWidth * 1.5,
                gene.startX, gene.endX);
        } else {
            strokePolylinesClipX(ctx, level.polylines, indices,
                hexToRgba(gene.color, skelAlpha), lineWidth * 1.5,
                gene.startX, gene.endX);
        }
    }
}

export function clearPolylineCache() {
    polylineCache = null;
}
