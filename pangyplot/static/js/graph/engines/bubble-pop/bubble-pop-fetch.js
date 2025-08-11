import { queueSubgraph, dequeueSubgraph } from './bubble-pop-queue.js';
import { getGraphCoordinates } from '../../graph-state.js';
import { buildUrl, fetchData } from '../../utils/network-utils.js';
import { explodeSubgraph } from './bubble-pop-force.js';
import eventBus from '../../../input/event-bus.js';
import { processPoppedSubgraph } from '../../graph-data/graph-manager.js';

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
    console.log("Fetched subgraph data:", rawSubgraph);

    const subgraph = processPoppedSubgraph(originNode.id, rawSubgraph);

    return; // TODO
    explodeSubgraph(originNode, subgraph, forceGraph);

    if (originNode.isSelected) {
        subgraph.nodes.forEach(node => node.isSelected = true);
    }

    eventBus.publish("graph-updated", true);
}
