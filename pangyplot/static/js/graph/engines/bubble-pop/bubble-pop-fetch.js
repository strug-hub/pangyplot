import { deleteNode } from './bubble-pop-engine.js';
import { queueSubgraph, dequeueSubgraph } from './bubble-pop-queue.js';
import { getGraphCoordinates } from '../../graph-state.js';
import { buildUrl, fetchData } from '../../utils/network-utils.js';
import { explodeSubgraph } from './bubble-pop-force.js';
import buildGraphData from '../../graph-data/graph-data.js';
import eventBus from '../../../input/event-bus.js';
import { setPoppedContents } from '../../graph-data/bubble-manager.js';

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

export function processSubgraphData(rawSubgraph, originNode, forceGraph) {
    const graphData = forceGraph.graphData();
    setPoppedContents(originNode.id, rawSubgraph);

    const currentNodeIds = new Set();
    graphData.nodes.forEach(node => currentNodeIds.add(node.id));

    // Some nodes and links are conditionally inluded based on the current graph state.
    for (const update of rawSubgraph.update) {
        // Check if all node ids in update.check are in graph
        if (update.check && update.check.every(id => currentNodeIds.has(id))) {
            // Delete all nodes from graphData whose id is in update.check
            update.check.forEach(id => {
                deleteNode(graphData, id);
            });

            // Remove nodes with id in update.exclude from rawSubgraph
            if (update.exclude) {
                rawSubgraph.nodes = rawSubgraph.nodes.filter(node => !update.exclude.includes(node.id));
            }

            if (update.replace) {
                rawSubgraph.nodes.push(...update.replace.nodes);
                rawSubgraph.links.push(...update.replace.links);
            }
        }
    }

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

    eventBus.publish("graph-updated", true);
}
