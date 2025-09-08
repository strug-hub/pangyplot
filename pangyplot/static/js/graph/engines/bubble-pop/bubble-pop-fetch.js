import { queueSubgraph, dequeueSubgraph } from './bubble-pop-queue.js';
import { buildUrl, fetchData } from '../../../utils/network-utils.js';
import { explodeSubgraph } from './bubble-pop-force.js';
import { processPoppedSubgraph } from '../../data/graph-manager.js';
import forceGraph from '../../force-graph.js';

let fetchChain = Promise.resolve();

export function fetchSubgraph(originNode) {
    const id = originNode.id;
    const wasAdded = queueSubgraph(id);
    if (!wasAdded) return;

    fetchChain = fetchChain.then(async () => {
        try {
            const params = { id, ...forceGraph.coords };
            const url = buildUrl('/subgraph', params);

            const fetchedData = await fetchData(url, 'subgraph');
            await processSubgraphData(fetchedData, originNode); // <-- wait for full build
        } finally {
            dequeueSubgraph(id);
        }
    });

    return fetchChain;
}

export function fetchBubbleEnd(chainId) {
    const params = { id: chainId, ...forceGraph.coords };
    const url = buildUrl('/subgraph', params);
    return fetchData(url, 'subgraph');
}

export async function processSubgraphData(rawSubgraph, originNode) {
    const subgraph = await processPoppedSubgraph(originNode.id, rawSubgraph, fetchBubbleEnd);

    // Now it's safe to update UI
    // explodeSubgraph(originNode, subgraph, forceGraph);
}
