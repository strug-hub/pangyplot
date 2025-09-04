import { colorState } from '../../render/color/color-state.js';
import { getNodeAnnotations, getGene } from "./gene-annotation-state.js";
import { labelPainter } from "../../render/painter/label-painter.js";

export const LABEL_SPEED = 0.05;
export const GRID_SIZE = 30;

//todo move this functionality to the /render directory

const labelCache = {};

export const splitScreenIntoGrid = (viewport, N) => {
    const grid = [];
    const sectionWidth = (viewport.x2 - viewport.x1) / N;
    const sectionHeight = (viewport.y2 - viewport.y1) / N;

    for (let i = 0; i < N; i++) {
        grid[i] = [];
        for (let j = 0; j < N; j++) {
            grid[i][j] = {
                nodes: [],
                x1: viewport.x1 + i * sectionWidth,
                y1: viewport.y1 + j * sectionHeight,
                x2: viewport.x1 + (i + 1) * sectionWidth,
                y2: viewport.y1 + (j + 1) * sectionHeight,
                centerX: viewport.x1 + (i + 0.5) * sectionWidth,
                centerY: viewport.y1 + (j + 0.5) * sectionHeight
            };
        }
    }
    return grid;
};

function findGroupCentroid(nodes) {
    const sumX = nodes.reduce((acc, n) => acc + n.x, 0);
    const sumY = nodes.reduce((acc, n) => acc + n.y, 0);
    return { x: sumX / nodes.length, y: sumY / nodes.length };
};

function interpolate(current, target, speed) {
    return current + (target - current) * speed;
}

/**
 * Check if label overlaps any previously placed label
 */
function overlapsOtherLabels(x, y, width, height, placed) {
    return placed.some(l => (
        Math.abs(x - l.x) < (width + l.width) / 2 &&
        Math.abs(y - l.y) < (height + l.height) / 2
    ));
}

function overlapsNode(x, y, padding, nodes) {
    return nodes.some(n => {
        const dx = x - n.x;
        const dy = y - n.y;
        return dx * dx + dy * dy < (padding * padding);
    });
}

/**
 * Spiral placement: search outward from anchor until no overlap
 */
function findSpiralPosition(anchor, labelWidth, labelHeight, placedLabels, nodes, maxRadius = 300) {
    let angle = 0;
    let radius = 0;
    const step = 5;
    while (radius < maxRadius) {
        const newX = anchor.x + radius * Math.cos(angle);
        const newY = anchor.y + radius * Math.sin(angle);

        if (
            !overlapsOtherLabels(newX, newY, labelWidth, labelHeight, placedLabels) &&
            !overlapsNode(newX, newY, 40, nodes)
        ) {
            return { x: newX, y: newY };
        }

        angle += 0.3;
        radius += step * angle / (2 * Math.PI);
    }
    return anchor; // fallback if no space found
}

export function renderGeneLabels(ctx, forceGraph, svg = false) {
    const visibleNodes = [];
    const annotationGroups = {};

    forceGraph.graphData().nodes.forEach(node => {
        if (!node.isVisible || !node.isDrawn) return;
        visibleNodes.push(node);

        const annotations = getNodeAnnotations(node.nodeId);
        Object.entries(annotations).forEach(([geneId, annotation]) => {
            if (!annotationGroups[geneId]) annotationGroups[geneId] = [];
            annotation.forEach(exonNumber => {
                annotationGroups[geneId].push({ node, exonNumber });
            });
        });
    });

    const labels = [];
    const placedLabels = [];

    Object.entries(annotationGroups).forEach(([geneId, groupNodes]) => {
        const gene = getGene(geneId);
        if (!gene) return;

        if (gene.showExons) {
            const exonGroups = {};
            groupNodes.forEach(({ node, exonNumber }) => {
                if (exonNumber) {
                    if (!exonGroups[exonNumber]) exonGroups[exonNumber] = [];
                    exonGroups[exonNumber].push(node);
                }
            });

            Object.entries(exonGroups).forEach(([exon, nodes]) => {
                const centroid = findGroupCentroid(nodes);
                const key = `${geneId}#${exon}`;
                const cached = labelCache[key] || centroid;

                labelCache[key] = {
                    x: interpolate(cached.x, centroid.x, LABEL_SPEED),
                    y: interpolate(cached.y, centroid.y, LABEL_SPEED)
                };

                const width = (gene.name.length + 6) * 12; // rough width
                const height = 12; // rough height

                const pos = findSpiralPosition(labelCache[key], width, height, placedLabels, visibleNodes);
                placedLabels.push({ ...pos, width, height });

                labels.push({ text: `${gene.name}:exon${exon}`, ...pos, color: gene.color, size: "medium" });
            });
        } else {
            const nodesOnly = groupNodes.map(({ node }) => node);
            const centroid = findGroupCentroid(nodesOnly);  // <-- current position of group
            const cached = labelCache[geneId] || centroid;

            const width = (gene.name.length + 2) * 20; // rough width
            const height = 20; // rough height

            // Spiral search around centroid, not cached
            const targetPos = findSpiralPosition(centroid, width, height, placedLabels, visibleNodes);

            // Smooth interpolation toward target spiral position
            labelCache[geneId] = {
                x: interpolate(cached.x, targetPos.x, LABEL_SPEED),
                y: interpolate(cached.y, targetPos.y, LABEL_SPEED)
            };

            placedLabels.push({ ...labelCache[geneId], width, height });

            labels.push({ text: gene.name, ...labelCache[geneId], color: gene.color, size: "large" });
        }

    });

    labels.forEach(l => labelPainter(ctx, l.text, l.x, l.y, l.size, l.color, colorState.background, svg));
};