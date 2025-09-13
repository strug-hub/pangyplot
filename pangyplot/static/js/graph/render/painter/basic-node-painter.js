import { getNodeColor } from '../color/color-style.js';
import { drawCircleSvg } from './painter-svg-utils.js';
import { drawCircle} from './painter-utils.js';
import { getScaleFactor, getZoomFactor } from '../render-scaling.js';
import { mixColors } from '../color/color-utils.js';

//possible todo: don't shrink if connected to a long link
function shrinkPower(z, L, opts = {}) {
  const { L0 = 100, p = 0.6, floor = 0.08 } = opts;
  // bigger L → smaller threshold → stays full-size longer
  const threshold = 1 / (1 + Math.pow(L / L0, p)); // ∈ (0,1]
  const t = Math.min(1, z / threshold);            // 0..1, how far above threshold
  const shrink = Math.max(t, floor);
  return shrink;
}

export function basicNodePainter(ctx, node, svg=null) {

    if (! node.isVisible || !node.isDrawn) return;
    
    const scaleFactor = getScaleFactor(ctx);
    const seqLength = node.record.seqLength || 1;
    var shrinkFactor = shrinkPower(getZoomFactor(ctx), seqLength);

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
