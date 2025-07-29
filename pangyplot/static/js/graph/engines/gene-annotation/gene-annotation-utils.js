function calculateEffectiveNodeStep(node, step){
    if (node.element.ranges.length === 0) {
        return null;
    }
   
    let matchedRange = null;
    for (const [rangeStart, rangeEnd] of node.element.ranges) {
        if (step >= rangeStart && step <= rangeEnd) {
            matchedRange = [rangeStart, rangeEnd];
            break;
        }
    }

    if (!matchedRange) {
        return null;  // No matching range found
    }

    const [start, end] = matchedRange;
    
    if (node.nodeIdx === 0) {
        return start;
    }
    if (node.kinks === 1) {
        return (start + end) / 2;
    }
    if (node.nodeIdx === node.kinks - 1) {
        return end;
    }

    return start + (node.nodeIdx * (end - start)) / (node.kinks - 1);
}

export function annotationOverlap(annotation, node) {
    if (!node.element.ranges) return false;

    const [annotationStart, annotationEnd] = annotation.range;

    for (const [rangeStart, rangeEnd] of node.element.ranges) {
        if (rangeStart <= annotationEnd && rangeEnd >= annotationStart) {
            const point = calculateEffectiveNodeStep(node, rangeStart);
            if (point >= annotationStart && point <= annotationEnd) return true;
        }
    }
    return false;
}

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

export const placeNodesInGrid = (nodes, grid, N) => {
    const sectionWidth = grid[0][0].x2 - grid[0][0].x1;
    const sectionHeight = grid[0][0].y2 - grid[0][0].y1;

    nodes.forEach(node => {
        const gridX = Math.floor((node.x - grid[0][0].x1) / sectionWidth);
        const gridY = Math.floor((node.y - grid[0][0].y1) / sectionHeight);

        if (gridX >= 0 && gridX < N && gridY >= 0 && gridY < N) {
            grid[gridX][gridY].nodes.push(node);
        }
    });
};

export const findGroupCentroid = (nodes) => {
    const sumX = nodes.reduce((acc, n) => acc + n.x, 0);
    const sumY = nodes.reduce((acc, n) => acc + n.y, 0);
    return { x: sumX / nodes.length, y: sumY / nodes.length };
};

export const findBestLabelPosition = (grid, centroid, hint = centroid) => {
    let bestSection = null;
    let minDist = Infinity;

    for (const row of grid) {
        for (const section of row) {
            if (section.nodes.length === 0) {
                const dCentroid = Math.hypot(centroid.x - section.centerX, centroid.y - section.centerY);
                const dHint = Math.hypot(hint.x - section.centerX, hint.y - section.centerY);
                const combined = dCentroid + dHint;

                if (combined < minDist) {
                    minDist = combined;
                    bestSection = section;
                }
            }
        }
    }

    return bestSection ? { x: bestSection.centerX, y: bestSection.centerY } : centroid;
};

export const interpolate = (current, target, speed) => current + (target - current) * speed;
