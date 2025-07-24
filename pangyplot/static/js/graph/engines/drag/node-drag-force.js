let PREVIOUS_DRAGGED_POS_FORCE = { x: null, y: null };
const DRAG_FORCE_BASE_STRENGTH = 1;
let DRAG_FORCE_STRENGTH_DECAY = 0.05;
let DRAG_SELECTED_CACHE = null;

function cacheDragSelectedForce(forceGraph, draggedNode) {
    const nodes = forceGraph.graphData().nodes;
    const links = forceGraph.graphData().links;

    const visited = new Set();
    const cache = [];

    const queue = [{ node: draggedNode, depth: 0 }];
    visited.add(draggedNode);

    const maxDepth = 200;

    while (queue.length > 0) {
        const { node, depth } = queue.shift();
        if (!node.isSelected){
            cache.push({ node, depth });
        }

        if (depth >= maxDepth) continue;

        for (const link of links) {
            const neighbor =
                link.source === node ? link.target :
                link.target === node ? link.source : null;

            if (neighbor && !visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push({ node: neighbor, depth: depth + 1 });
            }
        }
    }

    for (const node of nodes) {
        if (node.isSelected) {
            cache.push({ node, depth: 0 });
        }
    }

    return cache;
}


function pullNeighborsWhenDragging(alpha) {
    return; //todo
    if (!dragManagerIsDragging()) {
        PREVIOUS_DRAGGED_POS_FORCE.x = null;
        PREVIOUS_DRAGGED_POS_FORCE.y = null;
        DRAG_SELECTED_CACHE = null;
        return;
    }

    const dragged_node = dragManagerGetDraggedNode();

    if (DRAG_SELECTED_CACHE === null) {
        DRAG_SELECTED_CACHE = cacheDragSelectedForce(forceGraph, dragged_node);
    }

    const { x: prevX, y: prevY } = PREVIOUS_DRAGGED_POS_FORCE;
    PREVIOUS_DRAGGED_POS_FORCE = { x: dragged_node.x, y: dragged_node.y };

    if (prevX === null || prevY === null) return;

    const dx = dragged_node.x - prevX;
    const dy = dragged_node.y - prevY;

    for (const { node, depth } of DRAG_SELECTED_CACHE) {
        if (node === dragged_node) continue;

        const strength = depth === 0
            ? 1
            : Math.max(0, DRAG_FORCE_BASE_STRENGTH - DRAG_FORCE_STRENGTH_DECAY * depth);

        node.x += dx * strength;
        node.y += dy * strength;
    }
}

document.addEventListener('wheel', (e) => {
    if (!dragManagerIsDragging()) return;

    if (e.deltaY > 0) {
        DRAG_FORCE_STRENGTH_DECAY = Math.max(DRAG_FORCE_STRENGTH_DECAY - 0.005, 0.01);
    } else {
        DRAG_FORCE_STRENGTH_DECAY = Math.min(DRAG_FORCE_STRENGTH_DECAY + 0.005, 0.1);
    }
});


function renderDragInfluenceCircle(ctx, viewport) {
    return; //todo

    if (!dragManagerIsDragging()) {
        return;
    }
    const dragged_node = dragManagerGetDraggedNode();

    // Desired visual radius in screen pixels (e.g. ~50px)
    const screenRadiusPixels = (1/DRAG_FORCE_STRENGTH_DECAY) * 2;

    // Convert screen-space radius to graph-space using viewport
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    const viewportWidthGraph = viewport.x2 - viewport.x1;
    const viewportHeightGraph = viewport.y2 - viewport.y1;

    const pixelsPerGraphX = canvasWidth / viewportWidthGraph;
    const pixelsPerGraphY = canvasHeight / viewportHeightGraph;

    const graphUnitsPerPixel = (1 / pixelsPerGraphX + 1 / pixelsPerGraphY) / 2;
    const graphRadius = screenRadiusPixels * graphUnitsPerPixel;

    ctx.beginPath();
    ctx.arc(dragged_node.x, dragged_node.y, graphRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
    ctx.lineWidth = 5 * graphUnitsPerPixel;
    ctx.setLineDash([15, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

}
