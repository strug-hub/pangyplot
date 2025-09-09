import setUpRenderSettings from './settings/render-settings.js'
import { updateVisibility } from './viewport-utils.js';
import { renderDragInfluenceCircle } from '../engines/drag/drag-influence/drag-influence-render.js';
import { renderGeneLabels } from './annotation/gene-annotation-label-render.js';
import { renderCustomLabels } from './annotation/custom-label-renderer.js';
import { basicLinkPainter } from './painter/basic-link-painter.js';
import { basicNodePainter } from './painter/basic-node-painter.js';
import { updateBackgroundColor } from './color/color-manager.js';
import { updateLegend } from './color/legend/legend-manager.js';
import { highlightSelection } from './highlight/select-render.js';
import { renderGenes} from './highlight/gene-annotation-gene-render.js';

function renderPreFrame(ctx, forceGraph, svg=null) {

    updateBackgroundColor(forceGraph);
    updateVisibility(forceGraph);
    renderGenes(ctx, forceGraph, svg);
    highlightSelection(forceGraph);
}

function renderPostFrame(ctx, forceGraph, svg=null) {
    renderGeneLabels(ctx, forceGraph, svg);
    //searchSequenceEngineUpdate(ctx, forceGraph);
    renderCustomLabels(ctx, forceGraph, svg);
    renderDragInfluenceCircle(forceGraph);
}

export function renderFullFrame(ctx, forceGraph, svg=null) {
    renderPreFrame(ctx, forceGraph, svg);
    forceGraph.graphData().links.forEach(link => { basicLinkPainter(ctx, link, svg); });
    forceGraph.graphData().nodes.forEach(node => { basicNodePainter(ctx, node, svg); });
    renderPostFrame(ctx, forceGraph, svg);
}

export function setUpRenderManager(forceGraph) {
    updateLegend();
    setUpRenderSettings(forceGraph);
    const ctx = forceGraph.canvas.ctx;
    document.fonts.load('700 16px "Rubik"').then(() => {
        return document.fonts.ready;
    }).then(() => {
        ctx.font = `1000px "Rubik", "Comic Sans MS", Arial, sans-serif`;
    });

    forceGraph
        .onRenderFramePre((ctx) => renderPreFrame(ctx, forceGraph))
        .onRenderFramePost((ctx) => renderPostFrame(ctx, forceGraph))
        .nodeCanvasObject((node, ctx) => basicNodePainter(ctx, node))
        .linkCanvasObject((link, ctx) => basicLinkPainter(ctx, link));
}
