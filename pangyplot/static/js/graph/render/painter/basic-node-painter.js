import { getNodeColor } from '../color/color-style.js';
import { drawCircle } from './painter-utils.js';
import { getWidthAdjustment } from '../render-settings.js';

export default function basicNodePainter(ctx, node, svg=false) {

    if (! node.isVisible || !node.isDrawn) return;

    const zoomFactor = ctx.canvas.__zoom["k"];

    const color = getNodeColor(node);
    var nodesize = node.width + 3/zoomFactor;

    const widthAdjustment = getWidthAdjustment();
    nodesize = node.width + widthAdjustment;

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

