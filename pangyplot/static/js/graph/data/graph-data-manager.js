import eventBus from '../../utils/event-bus.js';
import deserializeGraph from './deserialize/deserialize-graph.js';
import forceGraph from '../force-graph.js';
import { cleanGraph } from './graph-data-integrity.js';
import { updateSelected } from '../engines/selection/selection-state.js';
import { anchorEndpointNodes } from '../utils/node-utils.js';
import { fetchData, buildUrl } from '../../utils/network-utils.js';

import { getNodeRecord, getConnectingLinkRecords, setAllInactive, setActive } from './records-manager.js';

import { createForceGraph } from '../graph.js';

// TODO: AS LONG AS WE HAVE A VALID SET OF NODES WE CAN RETRIEVE THEIR LINKS


const nodeElementLookup = new Map();
const linkElementLookup = new Map();
const nodeIidToLinkElements = new Map();

export function indexLinkRecord(linkRecord) {
  const element = linkRecord.linkElement;
  linkElementLookup.set(element.linkIid, element);
}

function deserializeAndIndex(rawGraph) {
  const graphData = deserializeGraph(rawGraph);

  for (const nodeElement of graphData.nodes) {
    nodeElementLookup.set(nodeElement.iid, nodeElement);
  }

  for (const linkElement of graphData.links) {
    linkElementLookup.set(linkElement.linkIid, linkElement);

    const sourceIid = linkElement.sourceIid;
    if (!nodeIidToLinkElements.has(sourceIid)) {
      nodeIidToLinkElements.set(sourceIid, new Set());
    }
    nodeIidToLinkElements.get(sourceIid).add(linkElement);
   
    const targetIid = linkElement.targetIid;
    if (!nodeIidToLinkElements.has(targetIid)) {
      nodeIidToLinkElements.set(targetIid, new Set());
    }
    nodeIidToLinkElements.get(targetIid).add(linkElement);
  }
  
  return graphData;
}

export function clearGraphManager() {
  nodeElementLookup.clear();
  linkElementLookup.clear();
}


export function addInsideContents(id, subgraph) {
  const nodeRecord = getNodeRecord(id);
  if (!nodeRecord) return;

  const insideSet = nodeRecord.inside;
  for (const element of subgraph.nodes) {
    insideSet.add(element);
  }
}


export function setUpGraphManager(forceGraph) {

}

function getUnpoppedContents(bubbleId) {
  const bubbleRecord = getNodeRecord(bubbleId)
  const nodes = Array.from(bubbleRecord.nodeElements);
  const links = getLinkElements(bubbleId);

  links.push(...bubbleRecord.linkElements);

  return { nodes, links };
}

function getPoppedContents(bubbleId, recursive = false) {
  const bubbleRecord = getNodeRecord(bubbleId);
  const nodes = [];
  const links = [];

  for (const element of bubbleRecord.inside) {
    nodes.push(element);
    links.push(...getLinkElements(element.id));

    if (recursive) {
      const insideContents = getPoppedContents(element.id, true);
      nodes.push(...insideContents.nodes);
      links.push(...insideContents.links);
    }
  }
  return { nodes, links };
}

function rescueLinks(subgraph) {
  const nodes = subgraph.nodes;
  const linkIids = new Set(subgraph.links.map(link => link.linkIid));
  for (const node of nodes) {
    for (const link of getLinkElements(node.id)) {

      const linkIid = link.linkIid;
      if (linkIids.has(linkIid)) continue;
      linkIids.add(linkIid);
      subgraph.links.push(link);
    }
  }

  return subgraph;
}

export function unpopBubble(bubbleId) {
  const graphData = forceGraph.graphData();

  const poppedContents = getPoppedContents(bubbleId, true);
  const unpoppedContents = getUnpoppedContents(bubbleId);

  for (const endId of [bubbleId + ":0", bubbleId + ":1"]) {
    console.log(getPoppedContents(endId).nodes)
    const inside = getPoppedContents(endId);
    poppedContents.nodes.push(...inside.nodes);
  }

  console.log("Unpopping bubble:", bubbleId);
  console.log("Popped contents:", poppedContents.nodes.map(n => n.id));
  console.log("Unpopped contents:", unpoppedContents.nodes.map(n => n.id));

  const recoverData = { nodes: [], links: [] };

  for (const link of unpoppedContents.links) {
    const siblingIds = [];

    if (link.targetId === bubbleId && link.sourceId.startsWith("b") && link.sourceId.includes(":")) {
        siblingIds.push(link.sourceId);
    } 
    if (link.sourceId === bubbleId && link.targetId.startsWith("b") && link.targetId.includes(":")) {
        siblingIds.push(link.targetId);
    }

    for (const sibId of siblingIds) {
      let flag = false;

      for (const elem of getNodeRecord(sibId).inside) {
        if (getNodeRecord(elem.id).active) {
          flag = true;
          break;
        }
      }

      if (flag) {
        if (getNodeRecord(sibId)) {
          recoverData.nodes.push(...getNodeElements(sibId));
          recoverData.links.push(...getLinkElements(sibId));
        }
      }
    }
  }

  for (const node of poppedContents.nodes) {
    removeNode(node.id, graphData);
  }

  unpoppedContents.nodes.forEach(node => node.isActive = true);
  graphData.nodes.push(...unpoppedContents.nodes, ...recoverData.nodes);
  graphData.links.push(...unpoppedContents.links, ...recoverData.links);

  updateForceGraph(graphData);
}

export function removeNode(id, graphData) {
  graphData.nodes = graphData.nodes.filter(node => node.id !== id);

  graphData.links = graphData.links.filter(link =>
    (link.class === "node" && link.id !== id) ||
    (link.class === "link" && link.source.id !== id && link.target.id !== id)
  );
}

function retrieveBubbleEnds(graphData, subgraph, fetchBubbleEndFn) {
  const ends = [];
  const subgraphNodes = subgraph.nodes.filter(node => node.type === 'bubble:end').map(node => node.id);

  for (const link of subgraph.links) {
    if (link.record.isPopLink) {

      // active nodes are in the graphData we check if they are in the subgraph
      const sourceActive = isNodeActive(link.sourceId) || subgraphNodes.includes(link.sourceId);
      const targetActive = isNodeActive(link.targetId) || subgraphNodes.includes(link.targetId);

      if (sourceActive && targetActive) {
        if (link.targetId === link.sourceId) {
          ends.push([link.sourceId, null]);
        } else {
          ends.push([link.targetId, link.sourceId]);
        }
      }
    }
  }

  const fetchPromises = [];
  for (const [node1, node2] of ends) {

    fetchPromises.push(
      fetchBubbleEndFn(node1).then(endData => {
        const endSubgraph = deserializeAndIndex(endData);
        console.log(`Fetched bubble end for ${node1} / ${node2}`, endData);
        subgraph.nodes.push(...endSubgraph.nodes);
        subgraph.links.push(...endSubgraph.links);
        addInsideContents(node1, endData);
        if (node2) {
            addInsideContents(node2, endData);
        }
      })
    );

    removeNode(node1, graphData);
    removeNode(node1, subgraph);
    if (node2) {
      removeNode(node2, subgraph);
      removeNode(node2, graphData);
    }
  }

  return fetchPromises;
}

export async function processPoppedSubgraph(bubbleId, rawSubgraph, fetchBubbleEndFn) {
  const graphData = forceGraph.graphData();

  const subgraph = deserializeAndIndex(rawSubgraph);

  addInsideContents(bubbleId, subgraph);
  //rescueLinks(subgraph);

  const fetchPromises = retrieveBubbleEnds(graphData, subgraph, fetchBubbleEndFn);
  await Promise.all(fetchPromises);

  removeNode(bubbleId, graphData);

  rescueLinks(subgraph);

  updateSelected(subgraph.nodes);

  graphData.nodes.push(...subgraph.nodes);
  graphData.links.push(...subgraph.links);

  updateForceGraph(graphData);
  
  eventBus.publish("graph:bubble-popped", bubbleId);
  return subgraph;
}

export function updateForceGraph(graphData) {
  cleanGraph(graphData);

  setAllInactive();
  
  graphData.nodes.forEach(node => {
    setActive(node.id);
    //node.fx = node.x;
    //node.fy = node.y;
  });

  forceGraph.graphData(graphData);
  eventBus.publish("graph:updated", true);
}

export function getActiveDeletionLinks() {
  const graphData = forceGraph.graphData();

  const links = [];
  for (const link of graphData.links) {
    if (link.isDel) {
      links.push(link);
    }
  }
  return links;
}


export function getNodeIfActive(iid) {
  return isNodeActive(iid) ? nodeIidDict.get(iid) : null;
}

export function isNodeActive(id) {
  const nodeRecord = getNodeRecord(id);
  return nodeRecord != null && nodeRecord.active;
}

export function getNodeElements(id) {
    const nodeRecord = getNodeRecord(id);
  return nodeRecord != null ? Array.from(nodeRecord.nodeElements) : [];
}
export function getInsideNodeElements(id) {
    const nodeRecord = getNodeRecord(id);
  return nodeRecord != null ? Array.from(nodeRecord.inside) : [];
}


export function getLinkElements(nodeId) {
  const connectingLinks = getConnectingLinkRecords(nodeId);
  const linkElements = [];  
  for (const linkRecord of connectingLinks) {
    linkElements.push(linkRecord.linkElement);
  }
  return linkElements;
}

export function getLinkElement(id) {
  return linkIidDict.get(id) || null;
}

export function getNodeComponents(id) {
  if (!isNodeActive(id)) {
    return { nodes: [], links: [] };
  }
  const nodes = getNodeElements(id);
  const links = getLinkElements(id).filter(link => link.class === 'node');
  
  return {
    nodes,
    links
  };

}

function fetchAndConstructGraph(coordinates){
    if (forceGraph.equalsCoords(coordinates)) return;
    forceGraph.coords = coordinates;

    const url = buildUrl('/select', coordinates);
    fetchData(url, 'graph').then(rawGraph => {
        console.log("Fetched graph data:", rawGraph);
        clearGraphManager();

        const graphData = deserializeAndIndex(rawGraph);
        anchorEndpointNodes(graphData.nodes, graphData.links);
        createForceGraph(graphData);
    }).catch(error => {
        console.warn("Skipping graph construction:", error);
    });
}

eventBus.subscribe("ui:construct-graph", function (data) {
    const { genome, chromosome, start, end } = data;
    const coordinates = { genome, chromosome, start, end };
    fetchAndConstructGraph(coordinates);
});
