import { getChildSubgraph } from './records-manager-implementation.js';
import { getNodeRecord, getLinkRecord } from './records-manager-implementation.js';
import { getConnectingLinkRecords } from './records-manager-implementation.js';
import { fetchCoordinateRange } from './fetch/fetch-coordinate-range.js';
import { fetchBubbleSubgraph } from './fetch/fetch-bubble-subgraph.js';

class RecordsManager {
  constructor() {
  }

  async getByCoordinate(coords) {
    return await fetchCoordinateRange(coords);
  }

  async getBubbleSubgraph(bubbleId) {

    //todo: getChildSubgraph to try records first, then fetch if needed
    return await fetchBubbleSubgraph(bubbleId);
  }


  getNode(id) {
    return getNodeRecord(id);
  }

  getNodes(ids) {
    return ids.map(id => getNodeRecord(id)).filter(node => node !== null);
  }

  getLink(id) {
    return getLinkRecord(id);
  }

  getLinks(id) {
    return getConnectingLinkRecords(id);
  }

  extractElementsFromRecords(records) {
    return {
      nodes: records.flatMap(r => r.elements?.nodes ?? []),
      links: records.flatMap(r => r.elements?.links ?? [])
    };
  }
}

const recordsManager = new RecordsManager();
export default recordsManager;