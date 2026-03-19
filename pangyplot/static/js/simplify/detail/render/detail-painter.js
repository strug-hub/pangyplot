// Pure canvas painting primitives for the detail layer.
// No state reads, no culling — just ctx path building and draw calls.

import {
    strokeLinesSvg, fillDotsSvg, strokePolylineSvg, strokeBatchPolylinesSvg,
    fillCirclesSvg, strokeRingSvg, strokeSegmentsSvg, strokeDashedPolylinesSvg
} from '../../render/simplify-svg-utils.js';

export function strokeLines(ctx, lines, color, lineWidth, alpha, svg = null) {
    if (svg) return strokeLinesSvg(svg, lines, color, lineWidth, alpha);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const line of lines) {
        ctx.moveTo(line[0][0], line[0][1]);
        ctx.lineTo(line[1][0], line[1][1]);
    }
    ctx.stroke();
}

export function fillDots(ctx, points, r, color, alpha, svg = null) {
    if (svg) return fillDotsSvg(svg, points, r, color, alpha);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (const [x, y] of points) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
}

export function strokePolyline(ctx, pl, color, lineWidth, alpha, svg = null) {
    if (svg) return strokePolylineSvg(svg, pl, color, lineWidth, alpha);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pl[0][0], pl[0][1]);
    for (let i = 1; i < pl.length; i++) {
        ctx.lineTo(pl[i][0], pl[i][1]);
    }
    ctx.stroke();
}

export function strokePolylines(ctx, polylines, color, lineWidth, alpha, svg = null) {
    if (svg) return strokeBatchPolylinesSvg(svg, polylines, color, lineWidth, alpha);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const pl of polylines) {
        if (pl.length < 2) continue;
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) {
            ctx.lineTo(pl[i][0], pl[i][1]);
        }
    }
    ctx.stroke();
}

export function fillCircles(ctx, circles, color, alpha, svg = null) {
    if (svg) return fillCirclesSvg(svg, circles, color, alpha);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (const { x, y, r } of circles) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
}

export function strokeRing(ctx, x, y, r, color, lineWidth, alpha, svg = null) {
    if (svg) return strokeRingSvg(svg, x, y, r, color, lineWidth, alpha);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
}

export function strokeSegments(ctx, segments, color, lineWidth, alpha, svg = null) {
    if (svg) return strokeSegmentsSvg(svg, segments, color, lineWidth, alpha);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const { x1, y1, x2, y2 } of segments) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
    }
    ctx.stroke();
}

export function strokeDashedPolylines(ctx, polylines, color, lineWidth, alpha, dash, svg = null) {
    if (svg) return strokeDashedPolylinesSvg(svg, polylines, color, lineWidth, alpha, dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.setLineDash([dash, dash]);
    ctx.beginPath();
    for (const pl of polylines) {
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) {
            ctx.lineTo(pl[i][0], pl[i][1]);
        }
    }
    ctx.stroke();
    ctx.setLineDash([]);
}
