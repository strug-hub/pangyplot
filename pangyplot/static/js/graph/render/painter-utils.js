import { rx, ry } from './render-offset.js';

export function drawLine(ctx, x1, y1, x2, y2, width, color) {
    const previousLineWidth = ctx.lineWidth;
    const previousLineCap = ctx.lineCap;
    const previousStrokeStyle = ctx.strokeStyle;

    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;

    ctx.beginPath();
    ctx.moveTo(rx(x1), ry(y1));
    ctx.lineTo(rx(x2), ry(y2));
    ctx.stroke();

    ctx.lineWidth = previousLineWidth;
    ctx.lineCap = previousLineCap;
    ctx.strokeStyle = previousStrokeStyle;
}

export function drawCircle(ctx, x, y, size, color) {
    const previousFillStyle = ctx.fillStyle;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(rx(x), ry(y), size / 2, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.fillStyle = previousFillStyle;
}

export function drawCircleOutline(ctx, x, y, size, color, lineWidth) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(rx(x), ry(y), size, 0, 2 * Math.PI, false);
    ctx.stroke();
}

export function drawPath(ctx, path, width, color) {
    ctx.save();

    if (path.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(rx(path[0].x), ry(path[0].y));

    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(rx(path[i].x), ry(path[i].y));
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();

}

export function drawSquare(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(rx(x) - size / 2, ry(y) - size / 2, size, size);
    ctx.restore();
}

export function drawRectangleOutline(ctx, x, y, width, height, color, lineWidth = 3) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.rect(rx(x), ry(y), width, height);
    ctx.stroke();
    ctx.restore();
}

export function drawTriangle(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(rx(x), ry(y) - size);
    ctx.lineTo(rx(x) - size, ry(y) + size);
    ctx.lineTo(rx(x) + size, ry(y) + size);
    ctx.fill();
    ctx.restore();
}

export function drawCross(ctx, x, y, size, width, color) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;

    ctx.moveTo(rx(x) - size, ry(y) - size);
    ctx.lineTo(rx(x) + size, ry(y) + size);
    ctx.moveTo(rx(x) + size, ry(y) - size);
    ctx.lineTo(rx(x) - size, ry(y) + size);

    ctx.stroke();
    ctx.restore();
}
export function drawRotatedCross(ctx, x, y, size, width, color, angle) {
    ctx.save();
    ctx.translate(rx(x), ry(y));
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;

    ctx.moveTo(-size, -size);
    ctx.lineTo(size, size);
    ctx.moveTo(size, -size);
    ctx.lineTo(-size, size);
    ctx.stroke();

    ctx.restore();
}

export function drawText(ctx, text, x, y, size, color, outlineWidth, outlineColor) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${size}px 'Rubik', 'Helvetica Neue', Helvetica, Arial, sans-serif`;

    if (outlineColor) {
        ctx.lineWidth = outlineWidth;
        ctx.strokeStyle = outlineColor;
        ctx.strokeText(text, rx(x), ry(y));
    }

    ctx.fillStyle = color;
    ctx.fillText(text, rx(x), ry(y));
    ctx.restore();
}
