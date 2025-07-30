import { getViewport } from './viewport.js';
import { updateVisibility } from './viewport.js';
import { renderDragInfluenceCircle } from '../engines/drag/drag-render.js';
import { renderGenes} from '../engines/gene-annotation/gene-annotation-gene-render.js';
import { renderGeneLabels} from '../engines/gene-annotation/gene-annotation-label-render.js';
import basicLinkPainter from './painter/basic-link-painter.js';
import basicNodePainter from './painter/basic-node-painter.js';
import labelPainter from './painter/label-painter.js';
import { updateBackgroundColor } from './color/color-manager.js';
import { updateLegend } from './color/legend/legend-manager.js';
import { highlightSelection } from '../engines/selection/select-render.js';
import { setZoomFactor } from '../graph-state.js';

function renderPreFrame(ctx, forceGraph) {
    const zoomFactor = ctx.canvas.__zoom.k;
    setZoomFactor(zoomFactor);

    updateBackgroundColor(forceGraph);
    updateVisibility(forceGraph);
    renderGenes(ctx, forceGraph);
    highlightSelection(ctx, forceGraph.graphData());
}

function renderPostFrame(ctx, forceGraph) {
    const viewport = getViewport(forceGraph);

    renderGeneLabels(ctx, forceGraph, viewport);
    //searchSequenceEngineUpdate(ctx, forceGraph);
    labelPainter(ctx, forceGraph);
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
