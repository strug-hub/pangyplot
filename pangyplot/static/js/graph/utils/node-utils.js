export function nodesInBox(forceGraph, bounds) {
    const nodes = forceGraph.graphData().nodes;
    const { left, right, top, bottom } = bounds;

    // Convert screen bounds to graph coordinates
    const topLeft = forceGraph.screen2GraphCoords(left, top);
    const bottomRight = forceGraph.screen2GraphCoords(right, bottom);

    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);

    const containedNodes = nodes.filter(node => {
        return node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY;
    });

    return containedNodes;
}