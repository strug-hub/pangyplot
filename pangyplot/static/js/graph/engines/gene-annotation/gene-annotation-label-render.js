import { splitScreenIntoGrid, placeNodesInGrid, findGroupCentroid, findBestLabelPosition, interpolate } from "./gene-annotation-utils.js";

export const FONT_SIZE = 180;
export const LABEL_SPEED = 0.05;
export const GRID_SIZE = 30;



const LABEL_CACHE = {};

export function renderGeneLabels(ctx, forceGraph, viewport, svg = false){
    const zoomFactor = ctx.canvas.__zoom.k;
    const visibleNodes = [];
    const annotationGroups = {};

    forceGraph.graphData().nodes.forEach(node => {
        if (!node.isVisible || !node.isDrawn) return;
        visibleNodes.push(node);

        const annotations = getAnnotations(node);
        annotations.forEach(ann => {
            if (!annotationGroups[ann.id]) annotationGroups[ann.id] = [];
            annotationGroups[ann.id].push({ node, exon_number: ann.exon_number });
        });
    });

    const grid = splitScreenIntoGrid(viewport, GRID_SIZE);
    placeNodesInGrid(visibleNodes, grid, GRID_SIZE);

    const fontSize = Math.max(FONT_SIZE, FONT_SIZE / (zoomFactor * 10));
    const labels = [];

    Object.entries(annotationGroups).forEach(([geneId, groupNodes]) => {
        const gene = getGeneInfo(geneId);
        if (!gene) return;

        if (gene.showExons) {
            const exonGroups = {};
            groupNodes.forEach(({ node, exon_number }) => {
                if (exon_number) {
                    if (!exonGroups[exon_number]) exonGroups[exon_number] = [];
                    exonGroups[exon_number].push(node);
                }
            });

            Object.entries(exonGroups).forEach(([exon, nodes]) => {
                const centroid = findGroupCentroid(nodes);
                const key = `${geneId}#${exon}`;
                const cached = LABEL_CACHE[key] || centroid;

                LABEL_CACHE[key] = {
                    x: interpolate(cached.x, centroid.x, LABEL_SPEED),
                    y: interpolate(cached.y, centroid.y, LABEL_SPEED)
                };

                labels.push({ text: `${gene.name}:exon${exon}`, ...LABEL_CACHE[key], color: gene.color, size: fontSize / 2 });
            });
        } else {
            const centroid = findGroupCentroid(groupNodes.map(g => g.node));
            const key = geneId;
            const cached = LABEL_CACHE[key] || findBestLabelPosition(grid, centroid, cached);
            LABEL_CACHE[key] = {
                x: interpolate(cached.x, centroid.x, LABEL_SPEED),
                y: interpolate(cached.y, centroid.y, LABEL_SPEED)
            };

            labels.push({ text: gene.name, ...LABEL_CACHE[key], color: gene.color, size: fontSize });
        }
    });

    const bgColor = colorManager();

    if (svg) {
        return labels.map(l => ({
            text: l.text,
            x: l.x,
            y: l.y,
            color: l.color,
            fontSize: l.size,
            stroke: bgColor,
            strokeWidth: l.size / 20
        }));
    } else {
        labels.forEach(l => drawText(l.text, ctx, l.x, l.y, l.size, l.color, bgColor, l.size / 8));
    }
};


