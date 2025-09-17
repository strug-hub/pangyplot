import setUpRenderSettings from './settings/render-settings.js'
import { updateVisibility } from './viewport-utils.js';
import { renderDragInfluenceCircle } from '../engines/drag/drag-influence/drag-influence-render.js';
import { renderGeneLabels } from './annotation/gene-annotation-label-render.js';
import { renderCustomLabels } from './annotation/custom-label-renderer.js';
import { renderGeneHighlights } from './annotation/gene-annotation-highlight-renderer.js';
import { basicLinkPainter } from './painter/basic-link-painter.js';
import { basicNodePainter } from './painter/basic-node-painter.js';
import { updateBackgroundColor } from './color/color-manager.js';
import { setUpColorState } from "./color/color-state.js";
import { setUpRenderScaling } from './render-scaling.js';
import { updateLegend } from './color/legend/legend-manager.js';
import { setUpHighlightSelectionRenderer } from './highlight/highlight-selection-renderer.js';
import { renderHoverEffect, renderHighlightEffect, renderSelectionEffect } from './highlight/highlight-selection-renderer.js';

function renderPreFrame(forceGraph, svg=null) {

    updateBackgroundColor(forceGraph);
    updateVisibility(forceGraph);
    renderGeneHighlights(forceGraph, svg);

    //select after highlight
    renderHighlightEffect(forceGraph);
    renderSelectionEffect(forceGraph);

}

function renderPostFrame(ctx, forceGraph, svg=null) {
    renderGeneLabels(forceGraph, svg);
    //searchSequenceEngineUpdate(ctx, forceGraph);
    renderCustomLabels(ctx, forceGraph, svg);
    renderDragInfluenceCircle(forceGraph);
    renderHoverEffect(forceGraph);
}

export function renderFullFrame(ctx, forceGraph, svg=null) {
    renderPreFrame(forceGraph, svg);
    forceGraph.graphData().links.forEach(link => { basicLinkPainter(ctx, link, svg); });
    forceGraph.graphData().nodes.forEach(node => { basicNodePainter(ctx, node, svg); });
    renderPostFrame(ctx, forceGraph, svg);
}

export function setUpRenderManager(forceGraph) {
    updateLegend();
    setUpRenderSettings(forceGraph);
    setUpColorState(forceGraph);
    setUpRenderScaling(forceGraph);

    const ctx = forceGraph.canvas.ctx;
    document.fonts.load('700 16px "Rubik"').then(() => {
        return document.fonts.ready;
    }).then(() => {
        ctx.font = `1000px "Rubik", "Comic Sans MS", Arial, sans-serif`;
    });

    setUpHighlightSelectionRenderer(forceGraph);

    forceGraph
        .onRenderFramePre((ctx) => renderPreFrame(forceGraph))
        .onRenderFramePost((ctx) => renderPostFrame(ctx, forceGraph))
        .nodeCanvasObject((node, ctx) => basicNodePainter(ctx, node))
        .linkCanvasObject((link, ctx) => basicLinkPainter(ctx, link));
}
