import { getNodeColor } from '../color/color-style.js';
import { drawCircleSvg } from './painter-svg-utils.js';
import { drawCircle} from './painter-utils.js';
import { getZoomLevel, getScaleFactor } from '../render-scaling.js';
import { mixColors } from '../color/color-utils.js';


export function basicNodePainter(ctx, node, svg=null) {

    if (! node.isVisible || !node.isDrawn) return;
    
    const scaleFactor = getScaleFactor(ctx);
    const seqLength = node.record.seqLength || 1;

    const zoomLevel = getZoomLevel(ctx, true);

    let shrinkFactor = 1;
    if(zoomLevel > 2) {
         shrinkFactor = 3-zoomLevel;
    }

    if (node.focused && node.focused > 0) {
        shrinkFactor = node.focused + (1-node.focused) * shrinkFactor;
    }

    if (shrinkFactor < 0.1) return;

    var color = getNodeColor(node);
    var width = node.width * scaleFactor * shrinkFactor;

    if (node.colorOverride) {
        color = mixColors(color, node.colorOverride, node.focused);
    }

    if (svg) {
        drawCircleSvg(svg, node.x, node.y, width, color);
    } else {
        drawCircle(ctx, node.x, node.y, width, color);
    }
}
