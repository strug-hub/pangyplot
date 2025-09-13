import { highlightNodePainter } from "../painter/highlight-node-painter.js";
import { highlightLinkPainter } from "../painter/highlight-link-painter.js";

const HIGHLIGHT_THICKNESS = 10;


function calculateEffectiveNodeStep(node, step){
    if (node.record.ranges.length === 0) return null;
   
    let matchedRange = null;
    for (const [rangeStart, rangeEnd] of node.record.ranges) {
        if (step >= rangeStart && step <= rangeEnd) {
            matchedRange = [rangeStart, rangeEnd];
            break;
        }
    }

    if (!matchedRange) return null;

    const [start, end] = matchedRange;
    
    if (node.idx === 0) {
        return start;
    }
    if (node.kinks === 1) {
        return (start + end) / 2;
    }
    if (node.idx === node.kinks - 1) {
        return end;
    }

    return start + (node.idx * (end - start)) / (node.kinks - 1);
}

export function renderGeneHighlights(forceGraph, svg = false) {
    const ctx = forceGraph.canvas.ctx;
    ctx.save();

    const { annotationToElements, layerCounters } = forceGraph.buildRenderIndex();

    for (const record of forceGraph.getRenderRecords()) {
        const { id, color } = record;
        const elements = annotationToElements[id];
        if (!elements) continue;

        // Track which nodes we’ve painted for this record
        const paintedNodes = new Set();

        // Pass 1: paint nodes, record their iids
        for (const element of elements) {
            if (!element.isNode) continue;

            let count = layerCounters[element.iid];
            if (count <= 0) continue;

            const thickness = HIGHLIGHT_THICKNESS * count;
            highlightNodePainter(ctx, element, color, thickness, svg);

            paintedNodes.add(element.iid);
            layerCounters[element.iid] = count - 1;
        }

        // Pass 2: paint links only if both ends are painted
        for (const element of forceGraph.graphData().links) {

            if (!paintedNodes.has(element.sourceIid) || !paintedNodes.has(element.targetIid)) {
                continue; // skip if either end isn’t painted
            }

            const srcCount = layerCounters[element.sourceIid] ?? 0;
            const tgtCount = layerCounters[element.targetIid] ?? 0;
            const count = Math.min(srcCount, tgtCount)+1;
            if (count <= 0) continue;

            const thickness = HIGHLIGHT_THICKNESS * count;
            highlightLinkPainter(ctx, element, color, thickness, svg);

            layerCounters[element.iid] = count - 1;
        }
    }

    ctx.restore();
}
