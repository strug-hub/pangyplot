// Pure canvas painting primitives for the skeleton layer.
// No state reads, no culling — just ctx path building and draw calls.

export function strokePolylines(ctx, polylines, indices, color, lineWidth) {
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

export function fillJunctions(ctx, points, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [x, y] of points) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
}

/**
 * Draw a single gene label bracket and text badge at a screen position.
 */
export function drawGeneLabel(ctx, name, sxStart, sxEnd, sxMid, syRef, color = '#e8a735') {
    const fontSize = 11;
    const geneW = sxEnd - sxStart;
    const bracketY = syRef - 16;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (geneW > 6) {
        ctx.beginPath();
        ctx.moveTo(sxStart, syRef + 4);
        ctx.lineTo(sxStart, bracketY);
        ctx.lineTo(sxEnd, bracketY);
        ctx.lineTo(sxEnd, syRef + 4);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(sxMid, syRef + 4);
        ctx.lineTo(sxMid, bracketY);
        ctx.stroke();
    }

    ctx.font = `600 ${fontSize}px 'SF Mono', Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const tw = ctx.measureText(name).width;
    const px = 5, py = 2;
    const ly = bracketY - 4;

    ctx.fillStyle = 'rgba(40, 32, 10, 0.85)';
    ctx.beginPath();
    ctx.roundRect(sxMid - tw / 2 - px, ly - fontSize - py, tw + px * 2, fontSize + py * 2, 3);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillText(name, sxMid, ly);
}
