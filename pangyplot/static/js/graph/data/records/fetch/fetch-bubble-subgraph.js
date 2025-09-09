
import DEBUG_MODE from '../../../../debug-mode.js';
import { deserializeBubbleSubgraph } from '../deserializer/deserializer.js';
import { buildUrl, fetchData } from '../../../../utils/network-utils.js';
import forceGraph from '../../../force-graph.js';

export async function fetchBubbleSubgraph(bubbleId) {
    let graphBubbleRecords = null;

    try {
        const params = { id: bubbleId, ...forceGraph.coords };
        const url = buildUrl('/pop', params);
        const rawGraph = await fetchData(url, 'subgraph');


        if (DEBUG_MODE) {
            console.log("[fetch-coordinate-range] raw:", rawGraph);
        }

        graphBubbleRecords = deserializeBubbleSubgraph(rawGraph, bubbleId);

        if (DEBUG_MODE) {
            console.log("[fetch-coordinate-range] deserialized:", graphBubbleRecords);
        }

    } catch (error) {
        console.warn("[fetch-coordinate-range] error:", error);
    } finally {
        return graphBubbleRecords;
    }
}




