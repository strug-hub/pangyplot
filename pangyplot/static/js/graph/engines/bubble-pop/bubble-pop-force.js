import { findNodeBounds, computeNodeCentroid } from '../../utils/node-utils.js';

export function explodeSubgraph(originNode, subgraph, forceGraph) {
    forceGraph.d3ReheatSimulation();

    const graphNodes = forceGraph.graphData().nodes;
    const originNodes = graphNodes.filter(n => n.id === originNode.id);
    const nodeBox = findNodeBounds(originNodes);
    const subgraphBox = findNodeBounds(subgraph.nodes);

    const centerX = nodeBox.x + nodeBox.width / 2;
    const centerY = nodeBox.y + nodeBox.height / 2;

    const centroid = computeNodeCentroid(subgraph.nodes);
    const offsetX = centerX - centroid.x;
    const offsetY = centerY - centroid.y;

    // Shift new nodes to align with origin
    subgraph.nodes.forEach(node => {
        node.x += offsetX;
        node.y += offsetY;
    });

    // Expand surrounding nodes if subgraph is large
    const widthBuffer = (subgraphBox.width - nodeBox.width) / 2;
    const heightBuffer = (subgraphBox.height - nodeBox.height) / 2;

    if (widthBuffer > 50 || heightBuffer > 50) {
        forceGraph.graphData().nodes.forEach(node => {
            const dx = node.x - (centerX);
            const dy = node.y - (centerY);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return;

            const normX = dx / dist;
            const normY = dy / dist;
            const shift = widthBuffer * Math.abs(normX) + heightBuffer * Math.abs(normY);

            if (node.fx != null && node.fy != null) {
                node.fx += normX * shift;
                node.fy += normY * shift;
            } else {
                node.x += normX * shift;
                node.y += normY * shift;
            }
        });
    }

    // Optional explosion force (currently disabled)
    // const widthRatio = subgraphBox.width / (nodeBox.width + 100);
    // const heightRatio = subgraphBox.height / (nodeBox.height + 100);
    // const scaleFactor = Math.max(widthRatio, heightRatio);
    // triggerExplosionForce(forceGraph, nodeResult.nodes, centerX, centerY, scaleFactor);
}
