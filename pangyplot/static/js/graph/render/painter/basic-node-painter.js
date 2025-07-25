import { getNodeColor } from '../color/color-style.js';
import { drawCircle } from './painter-utils.js';
import { relSize } from '../../engines/navigate/zoom-scale.js';

export default function basicNodePainter(ctx, node, svg=false) {

    if (! node.isVisible || !node.isDrawn) return;

    const zoomFactor = ctx.canvas.__zoom["k"];

    const color = getNodeColor(node);
    var nodesize = node.width + 3/zoomFactor;
    nodesize = node.width;
    if (svg) {
        return {
            cx: node.x,
            cy: node.y,
            size: nodesize,
            fill: color
        };
    } else {

        const debugRelSize = false;
        if (debugRelSize) {
            console.log("Relative size for node", node.id, "is", relSize);
            const effectiveRadius = Math.sqrt(node.width) * relSize;
            const effectiveDiameter = effectiveRadius * 2;
            const backgroundColor = "rgba(255, 0, 0, 0.2)";
            drawCircle(ctx, node.x, node.y, effectiveDiameter, backgroundColor);
        }

        drawCircle(ctx, node.x, node.y, nodesize, color);
    }
}

