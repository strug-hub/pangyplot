import { getChildSubgraph } from './records-manager-implementation.js';
import { getNodeRecord, getConnectingLinkRecords, linkRecordLookup, nodeAdjacencyLookup } from './records-manager-implementation.js';

//todo: lazily load pangyplot:
// all queries should be sent to records manager
//if data is locally available, return it
//if not, fetch it, store it, then return it

class RecordsManager {
    constructor() {
    }


    getNode(id) {
        return getNodeRecord(id);
    }

    getLinks(id) {
        return getConnectingLinkRecords(id);
    }

    getChildSubgraph(nodeId) {
        return getChildSubgraph(nodeId);
    }
}

export const recordsManager = new RecordsManager();