import { colorState } from '../../render/color/color-state.js';
import { labelPainter } from "../../render/painter/label-painter.js";

export const LABEL_SPEED = 0.05;
export const GRID_SIZE = 30;

const cache = {};

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

export function renderGeneLabels(forceGraph, svg=false) {
    const ctx = forceGraph.canvas.ctx;
    
    const { annotationToElements, layerCounters } = forceGraph.buildRenderIndex(true);
    
    const renderRecords = forceGraph.getRenderRecords();
    const recordLookup = {};
    renderRecords.forEach(r => { recordLookup[r.id] = r; });

    let annotationGroups = Object.entries(annotationToElements).map(([annId, elements]) => {
        const group = {key: annId, nodes: elements.filter(e => e.isNode)};
        
        if (annId.startsWith("exon:")) {
            const [pref, number, recordId] = annId.split(":");
            group.isExon = true;
            group.record = recordLookup[recordId] || null;
            if (!group.record) return null;
            group.label = `${group.record.name} [exon:${number}]`;
        } else {
            group.isExon = false;
            group.record = recordLookup[annId] || null;
            if (!group.record) return null;
            group.label = group.record.name;
        }

        return group;
    }).filter(group => group != null);

    const labels = [];
    const placedLabels = [];

    for(const group of annotationGroups) {
        const record = group.record;
        const centroid = findGroupCentroid(group.nodes);

        const cached = cache[group.key] || centroid;

        const width = (record.name.length + 2) * 20; // rough width
        const height = 20; // rough height

        const targetPos = findSpiralPosition(centroid, width, height, placedLabels, group.nodes);

        const pos = { x: interpolate(cached.x, targetPos.x, LABEL_SPEED),
                      y: interpolate(cached.y, targetPos.y, LABEL_SPEED) };

        cache[group.key] = pos;
        placedLabels.push({ ...pos, width, height });
        
        const size = group.isExon ? "medium" : "large";
        labels.push({ text: group.label, ...pos, color: record.color, size });
    }

    labels.forEach(l => labelPainter(ctx, l.text, l.x, l.y, l.size, l.color, colorState.background, svg));
};