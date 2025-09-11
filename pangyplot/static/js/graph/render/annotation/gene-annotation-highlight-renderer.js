import { highlightNodePainter } from "../painter/highlight-node-painter.js";
import { highlightLinkPainter } from "../painter/highlight-link-painter.js";

const HIGHLIGHT_THICKNESS = 10;

export function renderGeneHighlights(forceGraph, svg=false) {
    const ctx = forceGraph.canvas.ctx;
    ctx.save();

    const { annotationToElements, layerCounters } = forceGraph.buildRenderIndex();

    for (const record of forceGraph.getRenderRecords()) {
        const { id, color } = record;
        const elements = annotationToElements[id];

        if (!elements) continue;

        for (const element of elements) {
            let count = layerCounters[element.iid];
            if (count <= 0) continue;

            const thickness = HIGHLIGHT_THICKNESS * count;

            if (element.isNode) {
                highlightNodePainter(ctx, element, color, thickness, svg);
            } else if (element.isLink) {
                highlightLinkPainter(ctx, element, color, thickness, svg);
            }

            layerCounters[element.iid] = count - 1;
        }
    }

    ctx.restore();
}

