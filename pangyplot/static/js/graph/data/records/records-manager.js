import { getChildSubgraph } from './records-manager-implementation.js';
import { getNodeRecord, getLinkRecord } from './records-manager-implementation.js';
import { getConnectingLinkRecords } from './records-manager-implementation.js';
import { fetchCoordinateRange } from './fetch/fetch-coordinate-range.js';
import { fetchBubbleSubgraph } from './fetch/fetch-bubble-subgraph.js';
import { fetchGeneAnnotations } from './fetch/fetch-gene-annotation.js';

class RecordsManager {
  constructor() {
  }

  async getByCoordinate(coords) {
    return await fetchCoordinateRange(coords);
  }

  async getGenesByCoordinate(coords) {
    // could look at records first but we won't know if something is missing
    return await fetchGeneAnnotations(coords);
  }

  async getBubbleSubgraph(bubbleId) {

    //todo: getChildSubgraph to try records first, then fetch if needed
    return await fetchBubbleSubgraph(bubbleId);
  }
  
  getChildSubgraph(nodeId) {
    return getChildSubgraph(nodeId);
    //possibly fetch if not in records? - does this ever happen?
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

  getLinks(nodeId) {
    return getConnectingLinkRecords(nodeId);
  }

  extractElementsFromRecords(recordObj) {
    if (!recordObj) {
      return { nodes: [], links: [] };
    }

    // list of records
    if (Array.isArray(recordObj)) {
      return {
        nodes: recordObj.flatMap(r => r.elements?.nodes ?? []),
        links: recordObj.flatMap(r => r.elements?.links ?? [])
      };
    }

    // graphRecord-like object
    if (typeof recordObj === "object") {
      const nodeParts = this.extractElementsFromRecords(recordObj.nodes ?? []);
      const linkParts = this.extractElementsFromRecords(recordObj.links ?? []);

      return {
        nodes: [...nodeParts.nodes, ...linkParts.nodes],
        links: [...nodeParts.links, ...linkParts.links]
      };
    }

    return { nodes: [], links: [] };
  }
}

const recordsManager = new RecordsManager();
export default recordsManager;