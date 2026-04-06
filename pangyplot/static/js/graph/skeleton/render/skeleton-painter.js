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
