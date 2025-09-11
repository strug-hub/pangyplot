import { drawLine } from './painter-utils.js';
import { drawLineSvg } from './painter-svg-utils.js';
import { getScaleFactor } from '../render-scaling.js';

export function highlightLinkPainter(ctx, link, color, thickness, svg=null){
    if (! link.isVisible || !link.isDrawn) return;

    const width = thickness * getScaleFactor(ctx);

    const x1 = link.source.x;
    const y1 = link.source.y;
    const x2 = link.target.x;
    const y2 = link.target.y;
    
    if (svg){
        drawLineSvg(svg, x1, y1, x2, y2, width, color);
    } else{
        drawLine(ctx, x1, y1, x2, y2, width, color);
    }
}


