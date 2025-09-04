import { getNodeColor } from '../color/color-style.js';
import { drawCircleSvg } from './painter-svg-utils.js';
import { drawCircle} from './painter-utils.js';
import { getScaleFactor, getZoomFactor } from '../render-scaling.js';

//possible todo: don't shrink if connected to a long link
function shrinkPower(z, L, opts = {}) {
  const { L0 = 50, p = 0.6, floor = 0.08 } = opts;
  // bigger L → smaller threshold → stays full-size longer
  const threshold = 1 / (1 + Math.pow(L / L0, p)); // ∈ (0,1]
  const t = Math.min(1, z / threshold);            // 0..1, how far above threshold
  const shrink = Math.max(t, floor);
  return shrink;
}

export function basicNodePainter(ctx, node, svg=null) {

    if (! node.isVisible || !node.isDrawn) return;
    
    const scaleFactor = getScaleFactor(ctx);
    const seqLength = node.element.seqLength || 1;
    var shrinkFactor = shrinkPower(getZoomFactor(ctx), seqLength);

    if (node.color_override) {
        shrinkFactor = 1;
    }

    if (shrinkFactor < 0.1) return;

    var color = getNodeColor(node);

    var width = node.width * scaleFactor * shrinkFactor;

    if (node.color_override) {
        color = node.color_override;
    }

    if (svg) {
        drawCircleSvg(svg, node.x, node.y, width, color);
    } else {
        drawCircle(ctx, node.x, node.y, width, color);
    }
}

