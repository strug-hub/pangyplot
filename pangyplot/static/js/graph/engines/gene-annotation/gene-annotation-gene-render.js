import { getNodeAnnotations, getGene } from "./gene-annotation-state.js";
import { outlineNode, outlineLink } from "../../render/painter/painter-utils.js";
import { getScaleFactor } from "../../render/render-scaling.js";
import { highlightNodePainter } from "../../render/painter/highlight-node-painter.js";
import { highlightLinkPainter } from "../../render/painter/highlight-link-painter.js";

const HIGHLIGHT_THICKNESS = 4;

//todo move this functionality to the /render directory

export function renderGenes(ctx, forceGraph, svg = false) {

    ctx.save();

    const renderQueue = [];

    //todo: cache which nodes have gene annotations to avoid looping through all nodes
    forceGraph.graphData().nodes.forEach(node => {
        if (node.isVisible && node.isDrawn) {
            const annotations = getNodeAnnotations(node.nodeId);
            var n = 1;

            Object.entries(annotations).forEach(([geneId, annotation]) => {
                const gene = getGene(geneId);
                if (!gene || !gene.isVisible) {
                    return;
                }
                if (gene.showExons && annotation.length <= 0) {
                    return;
                }

                renderQueue.push({
                    type: 'node',
                    element: node,
                    color: gene.color,
                    thickness: HIGHLIGHT_THICKNESS * n
                });
                n += 1;
            });
        }
    });

    forceGraph.graphData().links.forEach(link => {
        if (link.isVisible && link.isDrawn) {
            const sourceAnnotations = getNodeAnnotations(link.source.nodeId)
            const targetAnnotations = getNodeAnnotations(link.target.nodeId);

            if (!sourceAnnotations || !targetAnnotations) return;
            const sourceSet = new Set(Object.keys(sourceAnnotations));

            var n = 1;

            Object.entries(targetAnnotations).forEach(([geneId, annotation]) => {

                if (!sourceSet.has(geneId)) return;
                const gene = getGene(geneId);
                if (!gene || !gene.isVisible) {
                    return;
                }
                const targetAnnotation = targetAnnotations[geneId];
                const sourceAnnotation = sourceAnnotations[geneId];

                if (gene.showExons) {
                    if (targetAnnotation.length <= 0 || sourceAnnotation.length <= 0) {
                        return;
                    }

                    const targetExons = new Set(targetAnnotation);
                    const hasSharedExon = sourceAnnotation.some(exon => targetExons.has(exon));
                    if (!hasSharedExon) {
                        return;
                    }
                }
                renderQueue.push({
                    type: 'link', 
                    element: link, 
                    color: gene.color, 
                    thickness: HIGHLIGHT_THICKNESS * n
                });
                n += 1;
            });
        }
    });

    renderQueue.sort((a, b) => b.thickness - a.thickness);
    
    renderQueue.forEach(item => {
        if (item.type === 'node') {
            highlightNodePainter(ctx, item.element, item.color, item.thickness, svg);
        } else if (item.type === 'link') {
            highlightLinkPainter(ctx, item.element, item.color, item.thickness, svg);
        }
    });
    
    ctx.restore();
}


