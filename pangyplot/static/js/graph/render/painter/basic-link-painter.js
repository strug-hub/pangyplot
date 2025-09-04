import { getLinkColor } from '../color/color-style.js';
import { drawLineSvg, drawRotatedCrossSvg } from './painter-svg-utils.js';
import { drawLine, drawRotatedCross } from './painter-utils.js';
import { getScaleFactor } from '../render-scaling.js';

export function basicLinkPainter(ctx, link, svg=null){
    if (! link.isVisible || !link.isDrawn) return;

    //todo: draw based on zoom factor and node distance

    const color = getLinkColor(link);

    const width = link.width * getScaleFactor(ctx);

    const x1 = link.source.x;
    const y1 = link.source.y;
    const x2 = link.target.x;
    const y2 = link.target.y;
    
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
