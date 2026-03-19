
import { isDebugMode } from '@app-state';
import { deserializePopResponse } from '../deserializer/deserializer.js';
import { buildUrl, fetchData } from '../../../../utils/network-utils.js';
import appState from '../../../app-state.js';

export async function fetchBubbleSubgraph(bubbleId) {
    let graphBubbleRecords = null;

    try {
        const params = { id: bubbleId, ...appState.coords };
        const url = buildUrl('/pop', params);
        const rawPop = await fetchData(url, 'subgraph');

        if (isDebugMode()) {
            console.log("[fetch-bubble-subgraph] raw:", rawPop);
        }

        graphBubbleRecords = deserializePopResponse(rawPop, bubbleId);

        if (isDebugMode()) {
            console.log("[fetch-bubble-subgraph] deserialized:", graphBubbleRecords);
        }

    } catch (error) {
        console.warn("[fetch-bubble-subgraph] error:", error);
    } finally {
        return graphBubbleRecords;
    }
}
