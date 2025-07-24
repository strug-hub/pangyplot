var GETTING_SUBGRAPH = new Set();
const pointerup_CLICK_RANGE = 0.05;

function queueSubgraph(nodeid) {
    if (GETTING_SUBGRAPH.has(nodeid)){
        return false;
    }
    GETTING_SUBGRAPH.add(nodeid);
    showLoader();
    return true;
}
function dequeueSubgraph(nodeid) {
    GETTING_SUBGRAPH.delete(nodeid);
    if (GETTING_SUBGRAPH.size === 0) {
        hideLoader();
    }
}

function explodeSubgraph(originNode, nodeResult, forceGraph) {
    forceGraph.d3ReheatSimulation();

    const graphNodes = forceGraph.graphData().nodes;
    const originNodes = graphNodes.filter(n => n.nodeid === originNode.nodeid);

    const nodeBox = findNodeBounds(originNodes);
    const subgraphBox = findNodeBounds(nodeResult.nodes);

    const centerX = nodeBox.x + nodeBox.width / 2;
    const centerY = nodeBox.y + nodeBox.height / 2;

    const subgraphCenter = {
        x: subgraphBox.x + subgraphBox.width / 2,
        y: subgraphBox.y + subgraphBox.height / 2
    };
    
    const centroid = computeNodeCentroid(nodeResult.nodes);

    const offsetX = centerX - centroid.x;
    const offsetY = centerY - centroid.y;
    centroid.x += offsetX;
    centroid.y += offsetY;

    nodeResult.nodes.forEach(node => {
        node.x += offsetX;
        node.y += offsetY;
    });

       
    const widthBuffer = (subgraphBox.width - nodeBox.width) / 2;
    const heightBuffer = (subgraphBox.height - nodeBox.height) / 2;
    
    if (widthBuffer > 50 || heightBuffer > 50){

        forceGraph.graphData().nodes.forEach(node => {

            const dx = node.x - centroid.x;
            const dy = node.y - centroid.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return;
        
            const normX = dx / dist;
            const normY = dy / dist;
        
            const widthWeight = Math.abs(normX);
            const heightWeight = Math.abs(normY);
            const shift = widthBuffer * widthWeight + heightBuffer * heightWeight * GLOBAL_MULTIPLIER;
            
            if (node.fx != null && node.fy != null) {
                node.fx += normX * shift;
                node.fy += normY * shift;
            } else {
                node.x += normX * shift;
                node.y += normY * shift;
            }
        });

    }

    // also may be overkill but I left the implementation in
    //const widthRatio = subgraphBox.width / (nodeBox.width + 100);
    //const heightRatio = subgraphBox.height / (nodeBox.height + 100);
    //const scaleFactor = Math.max(widthRatio, heightRatio);
    //triggerExplosionForce(forceGraph, nodeResult.nodes, centroid.x, centroid.y, scaleFactor);
}

function findSubgraphs(nodeIds, adjacencyList) {
    const visited = new Set();
    const connectedComponents = [];

    nodeIds.forEach(nodeId => {
        if (!visited.has(nodeId)) {
            const component = [];
            const queue = [nodeId];
            visited.add(nodeId);

            while (queue.length > 0) {
                const current = queue.shift();
                component.push(current);

                const neighbors = adjacencyList.get(current) || [];
                neighbors.forEach(neighbor => {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                });
            }
            connectedComponents.push(component);
        }
    });

    return connectedComponents;
}

function processSubgraphData(subgraph, originNode, forceGraph){
    graphData = forceGraph.graphData();

    //graphData.nodes = graphData.nodes.filter(node => node.type != "collapse");
    //graphData.links = graphData.links.filter(link => link.type != "collapse");

    //if (graphData.hasOwnProperty('collapsed_nodes')){
    //    graphData.nodes = [...graphData.nodes, ...graphData.collapsed_nodes];
    //    graphData.links = [...graphData.links, ...graphData.collapsed_links];
    //}

    let nodeResult = processNodes(subgraph.nodes);
    //nodeResult = makeRoomForSubgraph(nodeResult, originNode, forceGraph, false);
    //nodeResult = shiftSubgraph(nodeResult, originNode, forceGraph);
    explodeSubgraph(originNode, nodeResult, forceGraph)
    
    if(originNode.isSelected){
        nodeResult.nodes.forEach(node => { node.isSelected = true });
    }

    graphData = deleteNode(graphData, originNode.nodeid);

    const existingIds = new Set(graphData.nodes.map(n => n.nodeid));
    nodeResult.nodes = nodeResult.nodes.filter(n => !existingIds.has(n.nodeid));

    graphData.nodes = graphData.nodes.concat(nodeResult.nodes);

    links = processLinks(subgraph.links);

    const currentNodeIds = new Set(graphData.nodes.map(node => node.__nodeid));
    links = links.filter(link => 
        currentNodeIds.has(link.source) && currentNodeIds.has(link.target)
    );
        
    graphData.links = graphData.links.concat(links).concat(nodeResult.nodeLinks);
    forceGraph.graphData(graphData);

    //todo: take number as input
    //forceGraph = simplifyGraph(forceGraph, 1);
    //forceGraph = shrinkGraph(forceGraph, 1000); 
    
    annotationManagerAnnotateGraph(forceGraph.graphData());
    searchSequenceEngineRerun();
    
    document.dispatchEvent(new CustomEvent("updatedGraphData", { detail: { graph: forceGraph.graphData() } }));
}

function deleteNode(graphData, nodeid){
    graphData.nodes = graphData.nodes.filter(node => node.nodeid != nodeid);
    graphData.links = graphData.links.filter(link => 
        (link.class == "node" && link.nodeid != nodeid) ||
        (link.class == "edge" && link.sourceid != nodeid && link.targetid != nodeid));

    delete NODEIDS[nodeid];
    return graphData
}

function fetchSubgraph(originNode, forceGraph) {
    const nodeid = originNode.nodeid;

    if (! queueSubgraph(nodeid)){ return }

    // graph.js getGraphCoordinates()
    const params = {
        nodeid,
        ...getGraphCoordinates()
    };

    const url = buildUrl('/subgraph', params);
    fetchData(url, 'subgraph').then(fetchedData => {
        processSubgraphData(fetchedData, originNode, forceGraph)
        dequeueSubgraph(nodeid);
    });
}

function popNodeEngineMouseClick(event, forceGraph, canvasElement, canvas, coordinates, inputState){
    if (inputState===NODE_POP_MODE){

        const nearestNode = findNearestNode(forceGraph.graphData().nodes, coordinates);
        if (nearestNode.type == "null" || nearestNode.type == "segment" || nearestNode.type == "collapse"){ 
            return;
        }
        const normDist = findNormalizedDistance(nearestNode, coordinates, canvas);
    
        if (normDist < CAN_CLICK_RANGE){
            fetchSubgraph(nearestNode, forceGraph);
        }
    }
}

function popNodeEnginePopAll(nodes, forceGraph){
    //todo:batch request instead?

    nodes.forEach(node => {
        if (node.type != "segment" && node.type != "null"){
            fetchSubgraph(node,forceGraph);
        }
    });
}
