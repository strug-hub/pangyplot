// Base skeleton polylines (white with glow).

import { strokePolylines } from './skeleton-painter.js';

export function drawBasePolylines(ctx, level, visibleIndices, skelAlpha, lineWidth, svg = null) {
    // Glow pass: thicker, low-opacity for soft halo
    strokePolylines(ctx, level.polylines, visibleIndices, `rgba(255, 255, 255, ${0.15 * skelAlpha})`, lineWidth * 6, svg);
    // Crisp pass
    strokePolylines(ctx, level.polylines, visibleIndices, `rgba(255, 255, 255, ${0.75 * skelAlpha})`, lineWidth, svg);
}
