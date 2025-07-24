const SCALE_FACTOR = 1;

function resetGraphPositions(graph){
    graph.nodes.forEach(node => {
        node.x = node.initX;
        node.y = node.initY;
    });
}

function normalizeGraph(graph) {

    resetGraphPositions(graph)
    
    const bounds = findNodeBounds(graph.nodes);
    
    //const scaleX = (coordinates.xmax - coordinates.xmin)/SCALE_FACTOR;
    //const scaleY = (coordinates.ymax - coordinates.ymin)/SCALE_FACTOR;
    const shiftX = bounds.x;
    const shiftY = bounds.y;

    graph.nodes.forEach(node => {
        node.x = (node.x - shiftX) / SCALE_FACTOR;
        node.y = (node.y - shiftY) / SCALE_FACTOR;
        if (node.fx){ node.fx = node.x; }
        if (node.fy){ node.fy = node.y; }

    });

    return graph;
}




function findNodeBoundsInit(nodes) {
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

function findNodeBounds(nodes) {
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

function findNormalizedDistance(a, b, canvas) {
    const normX = canvas.max.x - canvas.min.x;
    const normY = canvas.max.y - canvas.min.y

    const normDistX = (b.x - canvas.min.x)/normX - (a.x - canvas.min.x)/normX
    const normDistY = (b.y - canvas.min.y)/normY - (a.y - canvas.min.y)/normY

    //in units relative to the size of the canvas
    return Math.sqrt((normDistX) ** 2 + (normDistY) ** 2);
}

function euclideanDist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function findNearestNode(nodes, coordinates) {
    let nearestNode = null;
    let minDistance = Infinity;
    
    nodes.forEach(node => {
        if ( node.isDrawn && node.class != "text"){
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

function computeNodeCentroid(nodes) {
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