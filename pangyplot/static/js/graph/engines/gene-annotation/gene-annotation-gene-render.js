import { getNodeAnnotations, getGene } from "./gene-annotation-state.js";
import { outlineNode, outlineLink } from "../../render/painter/painter-utils.js";
import { getScaleFactor } from "../../render/render-scaling.js";

const THICKNESS = 5;

export function renderGenes(ctx, forceGraph, svg = false) {
    //const genes = getAllGenes();
    const scaleFactor = getScaleFactor(ctx);
    ctx.save();

    let renderQueue = [];

    //todo: cache which nodes have gene annotations to avoid looping through all nodes
    forceGraph.graphData().nodes.forEach(node => {
        if (node.isVisible && node.isDrawn) {
            var hsize = (node.width+THICKNESS)*scaleFactor;
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
                    width: hsize * n, 
                    zIndex: n
                });
                n += 1;
            });
        }
    });

    forceGraph.graphData().links.forEach(link => {
        if (link.isVisible && link.isDrawn) {
            var hsize = (link.width + THICKNESS) * scaleFactor;
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
                    width: hsize * n, 
                    zIndex: n
                });
                n += 1;
            });
        }
    });
    
    renderQueue.sort((a, b) => b.zIndex - a.zIndex);
    
    if (svg){
        return renderQueue;
    } else; {
        renderQueue.forEach(item => {
            if (item.type === 'node') {
                outlineNode(item.element, ctx, 0, item.width, item.color);
            } else if (item.type === 'link') {
                outlineLink(item.element, ctx, 0, item.width, item.color);
            }
        });
    }

    ctx.restore();
}


