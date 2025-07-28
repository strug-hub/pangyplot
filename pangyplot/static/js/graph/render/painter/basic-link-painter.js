import { getLinkColor } from '../color/color-style.js';
import { drawLine, drawRotatedCross } from './painter-utils.js';

export default function basicLinkPainter(ctx, link, svg=false){
    if (! link.isVisible || !link.isDrawn) return;
    
    const color = getLinkColor(link);
    const zoomFactor = ctx.canvas.__zoom["k"];

    let zoomAdjust = 0;

    if (link.class === "node"){
        zoomAdjust = 3/zoomFactor;
    }
    const linkwidth = link.width+zoomAdjust;
    //console.log(link, link.source, link.target)
    const x1 = link.source.x;
    const y1 = link.source.y;
    const x2 = link.target.x;
    const y2 = link.target.y;
    
    //todo: add del cross to svg
    if (svg){
        return({
            x1:x1,
            x2:x2,
            y1:y1,
            y2:y2,
            width:linkwidth,
            color:color
        })
    } else{

        drawLine(ctx, x1, y1, x2, y2, linkwidth, color);
        if (link.isDel){
        
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const crossSize = (link.width+zoomAdjust)*2; 
            const angle = Math.atan2(y2 - y1, x2 - x1);
            
            drawRotatedCross(ctx, midX, midY, crossSize, link.width + zoomAdjust, color, angle);
        }
    }
}


