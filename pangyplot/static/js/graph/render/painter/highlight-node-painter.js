import { drawCircle } from './painter-utils.js';
import { drawCircleSvg } from './painter-svg-utils.js';
import { getScaleFactor } from '../render-scaling.js';

export function highlightNodePainter(ctx, node, color, thickness, svg=null) {

    if (! node.isVisible || !node.isDrawn) return;
    
    const scaleFactor = getScaleFactor(ctx);
    const width = (node.width+thickness) * scaleFactor;

    if (svg) {
        drawCircleSvg(svg, node.x, node.y, width, color);
    } else {
        drawCircle(ctx, node.x, node.y, width, color);
    }
}

