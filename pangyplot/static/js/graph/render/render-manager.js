import setUpRenderSettings from './render-settings.js'
import { getViewport, updateVisibility } from './viewport-utils.js';
import { renderDragInfluenceCircle } from '../engines/drag/drag-render.js';
import { renderGenes} from '../engines/gene-annotation/gene-annotation-gene-render.js';
import { renderGeneLabels} from '../engines/gene-annotation/gene-annotation-label-render.js';
import { basicLinkPainter } from './painter/basic-link-painter.js';
import { basicNodePainter } from './painter/basic-node-painter.js';
import { renderCustomLabels } from './annotation/custom-label-renderer.js';
import { updateBackgroundColor } from './color/color-manager.js';
import { updateLegend } from './color/legend/legend-manager.js';
import { highlightSelection } from '../engines/selection/select-render.js';
import { setZoomFactor } from '../graph-data/graph-state.js';

function renderPreFrame(ctx, forceGraph, svg=null) {
    const zoomFactor = ctx.canvas.__zoom.k;
    setZoomFactor(zoomFactor);

    updateBackgroundColor(forceGraph);
    updateVisibility(forceGraph);
    renderGenes(ctx, forceGraph, svg);
    highlightSelection(ctx, forceGraph.graphData());
}

function renderPostFrame(ctx, forceGraph, svg=null) {
    const viewport = getViewport(forceGraph);

    renderGeneLabels(ctx, forceGraph, svg);
    //searchSequenceEngineUpdate(ctx, forceGraph);
    renderCustomLabels(ctx, forceGraph, svg);
    renderDragInfluenceCircle(ctx, viewport);
}

export function renderFullFrame(ctx, forceGraph, svg=null) {
    renderPreFrame(ctx, forceGraph, svg);
    forceGraph.graphData().links.forEach(link => { basicLinkPainter(ctx, link, svg); });
    forceGraph.graphData().nodes.forEach(node => { basicNodePainter(ctx, node, svg); });
    renderPostFrame(ctx, forceGraph, svg);
}

export function setUpRenderManager(forceGraph, canvasElement) {
    updateLegend();
    setUpRenderSettings(forceGraph);

    document.fonts.load('700 16px "Rubik"').then(() => {
        return document.fonts.ready;
    }).then(() => {
        const ctx = canvasElement.getContext('2d');
        ctx.font = `1000px "Rubik", "Comic Sans MS", Arial, sans-serif`;
    });

    forceGraph
        .onRenderFramePre((ctx) => renderPreFrame(ctx, forceGraph))
        .onRenderFramePost((ctx) => renderPostFrame(ctx, forceGraph))
        .nodeCanvasObject((node, ctx) => basicNodePainter(ctx, node))
        .linkCanvasObject((link, ctx) => basicLinkPainter(ctx, link));
}
