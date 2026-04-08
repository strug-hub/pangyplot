// Pure canvas painting primitives for the skeleton layer.
// No state reads, no culling — just ctx path building and draw calls.

import { strokePolylinesSvg } from '../../render/svg-utils.js';

export function strokePolylines(ctx, polylines, indices, color, lineWidth, svg = null) {
    if (svg) return strokePolylinesSvg(svg, polylines, indices, color, lineWidth);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const i of indices) {
        const pl = polylines[i];
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let j = 1; j < pl.length; j++) {
            ctx.lineTo(pl[j][0], pl[j][1]);
        }
    }
    ctx.stroke();
}

/**
 * Stroke polylines clipped to an x range [xMin, xMax].
 * Segments crossing the boundary are interpolated to the clip edge.
 */
export function strokePolylinesClipX(ctx, polylines, indices, color, lineWidth, xMin, xMax) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const i of indices) {
        const pl = polylines[i];
        let inside = false;
        for (let j = 0; j < pl.length; j++) {
            const x = pl[j][0], y = pl[j][1];
            const cur = x >= xMin && x <= xMax;
            if (j === 0) {
                if (cur) { ctx.moveTo(x, y); inside = true; }
                continue;
            }
            const px = pl[j-1][0], py = pl[j-1][1];
            const prev = px >= xMin && px <= xMax;

            if (prev && cur) {
                // Both inside — continue line
                ctx.lineTo(x, y);
            } else if (prev && !cur) {
                // Exiting — interpolate to boundary
                const edge = x > xMax ? xMax : xMin;
                const t = (edge - px) / (x - px);
                ctx.lineTo(edge, py + t * (y - py));
                inside = false;
            } else if (!prev && cur) {
                // Entering — interpolate from boundary
                const edge = px < xMin ? xMin : xMax;
                const t = (edge - px) / (x - px);
                ctx.moveTo(edge, py + t * (y - py));
                ctx.lineTo(x, y);
                inside = true;
            }
            // Both outside — skip
        }
    }
    ctx.stroke();
}
