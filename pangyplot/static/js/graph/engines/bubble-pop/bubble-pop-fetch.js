import { queueSubgraph, dequeueSubgraph } from './bubble-pop-queue.js';
import { getGraphCoordinates } from '../../graph-state.js';
import { buildUrl, fetchData } from '../../../utils/network-utils.js';
import { explodeSubgraph } from './bubble-pop-force.js';
import { processPoppedSubgraph } from '../../graph-data/graph-manager.js';

let fetchChain = Promise.resolve();

export function fetchSubgraph(originNode) {
    const id = originNode.id;
    const wasAdded = queueSubgraph(id);
    if (!wasAdded) return;

    fetchChain = fetchChain.then(async () => {
        try {
            const params = { id, ...getGraphCoordinates() };
            const url = buildUrl('/subgraph', params);

            const fetchedData = await fetchData(url, 'subgraph');
            await processSubgraphData(fetchedData, originNode); // <-- wait for full build
        } finally {
            dequeueSubgraph(id);
        }
    });

    return fetchChain;
}

export function fetchBubbleEnd(chainNodeId) {
    const params = { id: chainNodeId, ...getGraphCoordinates() };
    const url = buildUrl('/subgraph', params);
    return fetchData(url, 'subgraph');
}

export async function processSubgraphData(rawSubgraph, originNode) {
    const subgraph = await processPoppedSubgraph(originNode.id, rawSubgraph, fetchBubbleEnd);

    // Now it's safe to update UI
    // explodeSubgraph(originNode, subgraph, forceGraph);
}
