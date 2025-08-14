import buildGraphData from './graph-data.js';
import { cleanGraph } from './graph-integrity.js';
import eventBus from '../../utils/event-bus.js';

let forceGraphRef = null;

const nodeDict = new Map();
const nodeIdDict = new Map();
const linkDict = new Map();
const linkIdDict = new Map();


function initializeNodeRecord(id) {
  if (nodeDict.has(id)) return;
  const record = {
    id,
    elements: new Set(),
    inside: new Set(),
    active: true
  };
  nodeDict.set(id, record);
}

export function addNodeRecord(element) {
  const id = element.id;
  if (!nodeDict.has(id)) {
    initializeLinkRecord(id);
    initializeNodeRecord(id);
  }
  nodeDict.get(id).elements.add(element);
  nodeIdDict.set(id, element);
}

export function addInsideContents(id, subgraph) {
  if (!nodeDict.has(id)) {
    initializeNodeRecord(id);
  }
  const insideSet = nodeDict.get(id).inside;
  for (const element of subgraph.nodes) {
    insideSet.add(element);
  }
}

function initializeLinkRecord(id) {
  if (linkDict.has(id)) return;
  linkDict.set(id, new Set());
}

export function addLinkRecord(element) {
  const toId = element.targetId;
  const fromId = element.sourceId;

  if (!linkDict.has(toId)) {
    initializeLinkRecord(toId);
  }
  if (!linkDict.has(fromId)) {
    initializeLinkRecord(fromId);
  }
  linkDict.get(toId).add(element);
  linkDict.get(fromId).add(element);

  linkIdDict.set(element.linkId, element);
}

export function clearGraphManager() {
  nodeDict.clear();
  linkDict.clear();
  nodeIdDict.clear();
  linkIdDict.clear();
}

export function setUpGraphManager(forceGraph) {
  forceGraphRef = forceGraph;
}

function getUnpoppedContents(bubbleId) {
  const bubble = nodeDict.get(bubbleId);
  const nodes = Array.from(bubble.elements);
  const links = getLinkElements(bubbleId);

  for (const element of bubble.elements) {
    links.push(...getLinkElements(element.id));
  }
  
  return { nodes, links };
}

function getPoppedContents(bubbleId, recursive = false) {
  const bubble = nodeDict.get(bubbleId);
  const nodes = [];
  const links = [];

  for (const element of bubble.inside) {
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
  const linkIds = new Set(subgraph.links.map(link => link.linkId));
  for (const node of nodes) {
    for (const link of getLinkElements(node.id)) {
      const linkId = link.linkId;
      if (linkIds.has(linkId)) continue;

      console.log(`Rescuing link ${linkId} for node ${node.id}`);
      linkIds.add(linkId);
      subgraph.links.push(link);
    }
  }

  return subgraph;
}

export function unpopBubble(bubbleId) {
  const graphData = forceGraphRef.graphData();

  const poppedContents = getPoppedContents(bubbleId, true);
  const unpoppedContents = getUnpoppedContents(bubbleId);

  const recoverData = { nodes: [], links: [] };

  for (const link of unpoppedContents.links) {
    const siblingIds = [];

    if (link.targetId === bubbleId && link.sourceId.startsWith("c")) {
        siblingIds.push(link.sourceId);
    } 
    if (link.sourceId === bubbleId && link.targetId.startsWith("c")) {
        siblingIds.push(link.targetId);
    }

    for (const sibId of siblingIds) {
      let flag = false;

      for (const elem of nodeDict.get(sibId).inside) {
        if (nodeDict.get(elem.id).active) {
          flag = true;
          break;
        }
      }

      if (flag) {
        if (nodeDict.has(sibId)) {
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

function findFullBubbleEnds(graphData, subgraph) {

  const newChainNodes = subgraph.nodes.filter(node => node.id.startsWith("c")).map(node => node.id);
  const chainNodes = graphData.nodes.filter(node => node.id.startsWith("c")).map(node => node.id);
  const results = [];

  for (const id of newChainNodes) {
    const parts = id.split(":");
    const chainId = parts[0];
    const chainStep = parseInt(parts[1]);
    const side = parseInt(parts[2]);
    const otherSide = side === 0 ? 1 : 0;

    const otherId = `${chainId}:${chainStep}:${otherSide}`;
    if (chainNodes.includes(otherId)) {
      results.push([otherId, id]);
    }
  }
  return results;
}

export async function processPoppedSubgraph(bubbleId, rawSubgraph, fetchBubbleEndFn) {
  const graphData = forceGraphRef.graphData();

  const subgraph = buildGraphData(rawSubgraph);

  addInsideContents(bubbleId, subgraph);

  // If both ends of a chain are present, fetch the segments inside
  const fetchPromises = [];
  for (const [graphId, subgraphId] of findFullBubbleEnds(graphData, subgraph)) {
    console.log(`Fetching bubble end for ${graphId} and ${subgraphId}`);
    fetchPromises.push(
      fetchBubbleEndFn(subgraphId).then(endData => {
        const endSubgraph = buildGraphData(endData);
        console.log(`Fetched bubble end for ${graphId} and ${subgraphId}`, endData);
        subgraph.nodes.push(...endSubgraph.nodes);
        subgraph.links.push(...endSubgraph.links);
        addInsideContents(graphId, endData);
        addInsideContents(subgraphId, endData);

      })
    );

    removeNode(graphId, graphData);
    removeNode(subgraphId, subgraph);
  }
  
  // Wait for all bubble-end fetches
  await Promise.all(fetchPromises);

  removeNode(bubbleId, graphData);

  rescueLinks(subgraph);

  subgraph.nodes.forEach(node => node.isSelected = true);

  graphData.nodes.push(...subgraph.nodes);
  graphData.links.push(...subgraph.links);

  updateForceGraph(graphData);
  return subgraph;
}

export function updateForceGraph(graphData) {
  cleanGraph(graphData);

  for (const node of nodeDict.values()) {
    node.active = false;
  }
  graphData.nodes.forEach(node => {
    nodeDict.get(node.id).active = true;
  });

  forceGraphRef.graphData(graphData);
  eventBus.publish("graph-updated", true);
}

export function getActiveDeletionLinks() {
  const graphData = forceGraphRef.graphData();

  const links = [];
  for (const link of graphData.links) {
    if (link.isDel) {
      links.push(link);
    }
  }
  return links;
}

export function getNodeElement(nodeId) {
  return nodeIdDict.get(nodeId) || null;
}

export function getNodeElements(id) {
  return nodeDict.has(id) ? Array.from(nodeDict.get(id).elements) : [];
}
export function getInsideNodeElements(id) {
  return nodeDict.has(id) ? Array.from(nodeDict.get(id).inside) : [];
}

export function getLinkElements(id) {
  return linkDict.has(id) ? Array.from(linkDict.get(id)) : [];
}
export function getLinkElement(id) {
  return linkIdDict.get(id) || null;
}
