import { queueSubgraph, dequeueSubgraph } from './bubble-pop-queue.js';
import { getGraphCoordinates } from '../../graph-state.js';
import { buildUrl, fetchData } from '../../utils/network-utils.js';
import { explodeSubgraph } from './bubble-pop-force.js';
import buildGraphData from '../../graph-data/graph-data.js';
import eventBus from '../../../input/event-bus.js';

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
        (link.class === "node" && link.id !== id) ||
        (link.class === "link" && link.source.id !== id && link.target.id !== id)
    );
}

export function processSubgraphData(rawSubgraph, originNode, forceGraph) {
    const graphData = forceGraph.graphData();
    const existingIds = new Set(graphData.nodes.map(n => n.id));

    // Merge end_data
    Object.entries(rawSubgraph.end_data).forEach(([bubble_id, end_graph]) => {
        if (!existingIds.has(bubble_id)) {
            rawSubgraph.nodes.push(...end_graph.nodes);
            rawSubgraph.links.push(...end_graph.links);
        }
    });

    const subgraph = buildGraphData(rawSubgraph, graphData);

    explodeSubgraph(originNode, subgraph, forceGraph);

    if (originNode.isSelected) {
        subgraph.nodes.forEach(node => node.isSelected = true);
    }

    deleteNode(graphData, originNode.id);

    // Filter out nodes already present
    const updatedIds = new Set(graphData.nodes.map(n => n.id));
    subgraph.nodes = subgraph.nodes.filter(n => !updatedIds.has(n.id));
    graphData.nodes.push(...subgraph.nodes);

    // Filter links to only those with valid source/target
    const nodeIds = new Set(graphData.nodes.map(n => n.nodeId));
    subgraph.links = subgraph.links.filter(link =>
        nodeIds.has(link.source) && nodeIds.has(link.target)
    );
    graphData.links.push(...subgraph.links);

    forceGraph.graphData(graphData);

    eventBus.publish("bubble-pop:graph-updated", true);
}
