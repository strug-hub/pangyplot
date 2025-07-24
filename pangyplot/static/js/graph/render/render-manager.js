import { getViewport } from './viewport.js';
import { updateVisibility } from './viewport.js';
import { renderDragInfluenceCircle } from '../engines/drag/drag-render.js';
import basicLinkPainter from './painter/basic-link-painter.js';
import basicNodePainter from './painter/basic-node-painter.js';
import { updateBackgroundColor } from './color/color-manager.js';
import { updateLegend } from './color/legend/legend-manager.js';

const HOVER_PRECISION = 2;

function renderPreFrame(ctx, forceGraph) {
    //const viewport = getViewport(forceGraph);
    updateBackgroundColor(forceGraph);
    updateVisibility(forceGraph);
    
    //TODO: this goes somewhere else
    const zoomFactor = ctx.canvas.__zoom.k;
    forceGraph.nodeRelSize(Math.max(10, HOVER_PRECISION / zoomFactor));

    //annotationManagerUpdate(ctx, forceGraph);
    //geneRenderEngineDraw(ctx, forceGraph.graphData());
}

function renderPostFrame(ctx, forceGraph) {
    const viewport = getViewport(forceGraph);

    //drawGeneName(ctx, forceGraph.graphData(), viewport);
    //labelEngineUpdate(ctx, forceGraph);
    //searchSequenceEngineUpdate(ctx, forceGraph);
    renderDragInfluenceCircle(ctx, viewport);
}

export default function setUpRenderManager(forceGraph) {
    updateLegend();

    forceGraph
        .onRenderFramePre((ctx) => renderPreFrame(ctx, forceGraph))
        .onRenderFramePost((ctx) => renderPostFrame(ctx, forceGraph))
        .nodeCanvasObject((node, ctx) => basicNodePainter(ctx, node))
        .linkCanvasObject((link, ctx) => basicLinkPainter(ctx, link));

}
