import { dragState } from './drag-state.js';

export function renderDragInfluenceCircle(ctx, viewport) {
  if (!dragState.draggedNode) return;

  const screenRadius = (1 / dragState.decay) * 2;
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  const viewportWidthGraph = viewport.x2 - viewport.x1;
  const viewportHeightGraph = viewport.y2 - viewport.y1;

  const graphUnitsPerPixel = ((viewportWidthGraph / canvasWidth) + (viewportHeightGraph / canvasHeight)) / 2;
  const graphRadius = screenRadius * graphUnitsPerPixel;

  ctx.beginPath();
  ctx.arc(dragState.draggedNode.x, dragState.draggedNode.y, graphRadius, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
  ctx.lineWidth = 3 * graphUnitsPerPixel;
  ctx.setLineDash([15, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
}
