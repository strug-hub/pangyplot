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

export function anchorEndpointNodes(nodes, links) {
    const outgoing = new Set();
    const incoming = new Set();

    for (const link of links) {
        outgoing.add(link.source);
        incoming.add(link.target);
    }

    let anchoredCount = 0;
    for (const node of nodes) {
        const hasOutgoing = outgoing.has(node.iid);
        const hasIncoming = incoming.has(node.iid);

        if (!hasIncoming || !hasOutgoing) {
            node.fx = node.x;
            node.fy = node.y;
            anchoredCount++;
        }
    }
}

export function resetGraphPositions(graph){
    graph.nodes.forEach(node => {
        node.x = node.initX;
        node.y = node.initY;
    });
}

export function findNodeBoundsInit(nodes) {
    let bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
    };

    nodes.forEach(node => {
        if (node.class != "text") {
            if (node.initX < bounds.minX) bounds.minX = node.initX;
            if (node.initX > bounds.maxX) bounds.maxX = node.initX;
            if (node.initY < bounds.minY) bounds.minY = node.initY;
            if (node.initY > bounds.maxY) bounds.maxY = node.initY;
        }
    });

    return { x: bounds.minX, y: bounds.minY, 
        width: bounds.maxX - bounds.minX, 
        height: bounds.maxY - bounds.minY };
}

export function findNodeBounds(nodes) {
    let bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
    };
    nodes.forEach(node => {
        if (node.class != "text") {
            if (node.x < bounds.minX) bounds.minX = node.x;
            if (node.x > bounds.maxX) bounds.maxX = node.x;
            if (node.y < bounds.minY) bounds.minY = node.y;
            if (node.y > bounds.maxY) bounds.maxY = node.y;
        }
    });

    return { x: bounds.minX, y: bounds.minY, 
        width: bounds.maxX - bounds.minX, 
        height: bounds.maxY - bounds.minY };
}

export function euclideanDist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function findNearestNode(nodes, coordinates) {
    let nearestNode = null;
    let minDistance = Infinity;
    
    nodes.forEach(node => {
        if ( node.isDrawn && node.class === "node"){
            const distance = Math.sqrt((coordinates.x - node.x) ** 2 + (coordinates.y - node.y) ** 2);
            // give a boost to smaller nodes
            const effectiveDistance = distance*(node.isSingleton ? 0.9 : 1);

            if (effectiveDistance < minDistance) {
                minDistance = effectiveDistance;
                nearestNode = node;
            }
        }
    });

    return nearestNode;
}

export function computeNodeCentroid(nodes) {
    if (nodes.length === 1) return { x: nodes[0].x, y: nodes[0].y };

    const sum = nodes.reduce((acc, n) => {
        acc.x += n.x;
        acc.y += n.y;
        return acc;
    }, { x: 0, y: 0 });
    
    return {
        x: sum.x / nodes.length,
        y: sum.y / nodes.length
    };
}