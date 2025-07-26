import { queueSubgraph, dequeueSubgraph } from './bubble-pop-queue.js';
import { getGraphCoordinates } from '../../graph-state.js';
import { buildUrl, fetchData } from '../../utils/network-utils.js';
import { explodeSubgraph } from './bubble-pop-force.js';
import buildGraphData from '../../graph-data/graph-data.js';

export function fetchSubgraph(originNode, forceGraph) {
    const id = originNode.id;
    const wasAdded = queueSubgraph(id);
    if (!wasAdded) return;

    const params = {id, ...getGraphCoordinates()};

    const url = buildUrl('/subgraph', params);
    fetchData(url, 'subgraph')
        .then(fetchedData => {
            processSubgraphData(fetchedData, originNode, forceGraph);
            dequeueSubgraph(id);
        });
}

export function deleteNode(graphData, id) {
    graphData.nodes = graphData.nodes.filter(node => node.id !== id);
    graphData.links = graphData.links.filter(link =>
        (link.class === "node" && link.nodeId !== id) ||
        (link.class === "link" && link.sourceId !== id && link.targetId !== id)
    );
}

export function processSubgraphData(rawSubgraph, originNode, forceGraph) {
    let graphData = forceGraph.graphData();

    const subgraph = buildGraphData(rawSubgraph);
    explodeSubgraph(originNode, subgraph, forceGraph);

    if (originNode.isSelected) {
        subgraph.nodes.forEach(node => node.isSelected = true);
    }

    deleteNode(graphData, originNode.id);

    const existingIds = new Set(graphData.nodes.map(n => n.id));
    subgraph.nodes = subgraph.nodes.filter(n => !existingIds.has(n.id));

    graphData.nodes = graphData.nodes.concat(subgraph.nodes);

    const currentNodeIds = new Set(graphData.nodes.map(node => node.id));
    subgraph.links = subgraph.links.filter(link =>
        currentNodeIds.has(link.source) && currentNodeIds.has(link.target)
    );

    graphData.links = graphData.links.concat(subgraph.links);
    forceGraph.graphData(graphData);


    //TODO:
    //annotationManagerAnnotateGraph(forceGraph.graphData());
    //searchSequenceEngineRerun();
}