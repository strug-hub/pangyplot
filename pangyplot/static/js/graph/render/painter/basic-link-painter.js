import { getLinkColor } from '../color/color-style.js';
import { drawLine, drawLineSvg, drawRotatedCross } from './painter-utils.js';
import { getScaleFactor, getZoomFactor } from '../render-scaling.js';

export function basicLinkPainter(ctx, link, svg=null){
    if (! link.isVisible || !link.isDrawn) return;

    //todo: draw based on zoom factor and node distance
    //if (getZoomFactor(ctx) < 0.1) {
    //    return;
    //}
    const color = getLinkColor(link);

    const linkwidth = link.width * getScaleFactor(ctx);
    // + zoomAdjust + widthAdjustment;

    const x1 = link.source.x;
    const y1 = link.source.y;
    const x2 = link.target.x;
    const y2 = link.target.y;
    
    //todo: add del cross to svg
    if (svg){
        console.log(linkwidth)
        drawLineSvg(svg, x1, y1, x2, y2, linkwidth, color);
    } else{

        drawLine(ctx, x1, y1, x2, y2, linkwidth, color);
        if (link.isDel){
        
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            //const crossSize = (link.width+zoomAdjust)*2; 
            const angle = Math.atan2(y2 - y1, x2 - x1);
            
            //drawRotatedCross(ctx, midX, midY, crossSize, link.width + zoomAdjust, color, angle);
        }
    }
}


