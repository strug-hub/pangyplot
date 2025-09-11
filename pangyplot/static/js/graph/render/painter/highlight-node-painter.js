import { drawCircle, drawCircleOutline } from './painter-utils.js';
import { drawCircleSvg } from './painter-svg-utils.js';
import { getScaleFactor } from '../render-scaling.js';

export function highlightNodePainter(ctx, node, color, thickness, svg=null) {

    if (! node.isVisible || !node.isDrawn) return;
    
    const scaleFactor = getScaleFactor(ctx);
    const width = thickness * scaleFactor;

    if (svg) {
        drawCircleSvg(svg, node.x, node.y, width, color);
    } else {
        drawCircle(ctx, node.x, node.y, width, color);
    }
}

export function outlineNodePainter(ctx, node, color, size, thickness, svg=null) {

    if (! node.isVisible || !node.isDrawn) return;
    
    const scaleFactor = getScaleFactor(ctx);
    const width = size * scaleFactor;
    const lineThickness = thickness * scaleFactor;

    if (svg) {
    //doesn't exist yet:
    //drawCircleOutlineSvg(svg, node.x, node.y, width, color);
    }  else {
        drawCircleOutline(ctx, node.x, node.y, width, color, lineThickness);
    }

}
