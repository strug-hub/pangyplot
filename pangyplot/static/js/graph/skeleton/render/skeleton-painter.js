// Pure canvas painting primitives for the skeleton layer.
// No state reads, no culling — just ctx path building and draw calls.

import { strokePolylinesSvg } from '../../render/svg-utils.js';
import { rx, ry } from '../../render/render-offset.js';

export function strokePolylines(ctx, polylines, indices, color, lineWidth, svg = null) {
    if (svg) return strokePolylinesSvg(svg, polylines, indices, color, lineWidth);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const i of indices) {
        const pl = polylines[i];
        ctx.moveTo(rx(pl[0][0]), ry(pl[0][1]));
        for (let j = 1; j < pl.length; j++) {
            ctx.lineTo(rx(pl[j][0]), ry(pl[j][1]));
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
                if (cur) { ctx.moveTo(rx(x), ry(y)); inside = true; }
                continue;
            }
            const px = pl[j-1][0], py = pl[j-1][1];
            const prev = px >= xMin && px <= xMax;

            if (prev && cur) {
                // Both inside — continue line
                ctx.lineTo(rx(x), ry(y));
            } else if (prev && !cur) {
                // Exiting — interpolate to boundary
                const edge = x > xMax ? xMax : xMin;
                const t = (edge - px) / (x - px);
                ctx.lineTo(rx(edge), ry(py + t * (y - py)));
                inside = false;
            } else if (!prev && cur) {
                // Entering — interpolate from boundary
                const edge = px < xMin ? xMin : xMax;
                const t = (edge - px) / (x - px);
                ctx.moveTo(rx(edge), ry(py + t * (y - py)));
                ctx.lineTo(rx(x), ry(y));
                inside = true;
            }
            // Both outside — skip
        }
    }
    ctx.stroke();
}
