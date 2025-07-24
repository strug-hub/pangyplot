import { getNodeColor } from '../color/color-style.js';
import { drawCircle } from './painter-utils.js';

export default function basicNodePainter(ctx, node, svg=false) {
    if (! node.isVisible || !node.isDrawn) return;

    const zoomFactor = ctx.canvas.__zoom["k"];
    const color = getNodeColor(node);
    const nodesize = node.width + 3/zoomFactor;
    if (svg) {
        return {
            cx: node.x,
            cy: node.y,
            size: nodesize,
            fill: color
        };
    } else {
        drawCircle(ctx, node.x, node.y, nodesize, color);
    }
}

