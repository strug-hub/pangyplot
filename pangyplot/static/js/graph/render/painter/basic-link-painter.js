import { getLinkColor } from '../color/color-style.js';
import { drawLineSvg, drawRotatedCrossSvg } from './painter-svg-utils.js';
import { drawLine, drawRotatedCross } from './painter-utils.js';
import { getScaleFactor } from '../render-scaling.js';
import { mixColors } from '../color/color-utils.js';

export function basicLinkPainter(ctx, link, svg=null){
    if (! link.isVisible || !link.isDrawn) return;

    //todo: draw based on zoom factor and node distance

    let color = getLinkColor(link);

    const width = link.width * getScaleFactor(ctx);

    const source = link.source;
    const target = link.target;
    const x1 = source.x;
    const y1 = source.y;
    const x2 = target.x;
    const y2 = target.y;

    if (link.colorOverride) {
        color = link.colorOverride;
    }
    else if (source.focused && target.focused) {
        if (source.focused > 0 && target.focused > 0) {
            const focused = (source.focused + target.focused) / 2;
            color = mixColors(color, source.colorOverride, focused);
        }
    }

    if (svg){
        drawLineSvg(svg, x1, y1, x2, y2, width, color);
    } else{
        drawLine(ctx, x1, y1, x2, y2, width, color);
    }

    if (link.isDel){
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const crossSize = (width) * 2;
        const angle = Math.atan2(y2 - y1, x2 - x1);

        if (svg){
            drawRotatedCrossSvg(svg, midX, midY, crossSize, width, color, angle);
        } else {
            drawRotatedCross(ctx, midX, midY, crossSize, width, color, angle);
        }
    }
}
