import { getViewport } from '../../../render/viewport-utils.js';
import { influence } from './drag-influence-engine.js';

//todo: better match actual range

export function renderDragInfluenceCircle(forceGraph) {
    if (!forceGraph.isDragging()) return;
    const draggedNode = forceGraph.draggedNode;

    const ctx = forceGraph.canvas.ctx;
    const viewport = getViewport(forceGraph);

    const screenRadius = influence * 200; // pixels
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    const viewportWidthGraph = viewport.x2 - viewport.x1;
    const viewportHeightGraph = viewport.y2 - viewport.y1;

    const graphUnitsPerPixel = ((viewportWidthGraph / canvasWidth) + (viewportHeightGraph / canvasHeight)) / 2;
    const graphRadius = screenRadius * graphUnitsPerPixel;
    
    ctx.beginPath();
    ctx.arc(draggedNode.x, draggedNode.y, graphRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
    ctx.lineWidth = 3 * graphUnitsPerPixel;
    ctx.setLineDash([15, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
}
