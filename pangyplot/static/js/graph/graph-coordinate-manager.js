var X_SHIFT = 0;
var Y_SHIFT = 0;

export function centerGraphData(graphData) {

    graphData.nodes.forEach(node => {
        node.x = node.initX - X_SHIFT;
        node.homeX = node.x;
        node.y = node.initY - Y_SHIFT;
        node.homeY = node.y;
    });
}

export function recenterGraphData(graphData) {
    const nodes = graphData.nodes;

    // Calculate the center of the graph
    const centerX = (Math.min(...nodes.map(n => n.initX)) + Math.max(...nodes.map(n => n.initX))) / 2;
    const centerY = (Math.min(...nodes.map(n => n.initY)) + Math.max(...nodes.map(n => n.initY))) / 2;
    X_SHIFT = centerX;
    Y_SHIFT = centerY;

    centerGraphData(graphData);
}