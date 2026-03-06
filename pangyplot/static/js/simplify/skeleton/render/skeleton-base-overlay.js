// Base skeleton polylines and junctions (white).

import { state } from '../../simplify-state.js';
import { strokePolylines, fillJunctions } from './skeleton-painter.js';

export function drawBasePolylines(ctx, level, visibleIndices, skelAlpha, lineWidth) {
    strokePolylines(ctx, level.polylines, visibleIndices, `rgba(255, 255, 255, ${0.75 * skelAlpha})`, lineWidth);
}

export function drawBaseJunctions(ctx, visibleJunctions, skelAlpha) {
    const r = Math.max(1.5, 3.0 / state.zoom);
    fillJunctions(ctx, visibleJunctions, r, `rgba(255, 255, 255, ${0.35 * skelAlpha})`);
}
