import buildGraphData from './graph-data.js';
import { cleanGraph } from './graph-integrity.js';
import eventBus from '../../input/event-bus.js';

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

export function addToInsideNode(id, insideElements) {
  if (!nodeDict.has(id)) {
    initializeNodeRecord(id);
  }
  const insideSet = nodeDict.get(id).inside;
  for (const el of insideElements) {
    insideSet.add(el);
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

export function setPoppedContents(bubbleId, subgraph) {
  subgraph.nodes.forEach(addNodeRecord);
  addToInsideNode(bubbleId, subgraph.nodes);
  subgraph.links.forEach(addLinkRecord);
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

export function unpopBubble(bubbleId) {
  const graphData = forceGraphRef.graphData();

  const poppedContents = getPoppedContents(bubbleId, true);
  const unpoppedContents = getUnpoppedContents(bubbleId);

  const recoverData = { nodes: [], links: [] };

  for (const link of unpoppedContents.links) {
    const siblingIds = [];

    if (link.targetId === bubbleId) {
      if (link.sourceId.startsWith("b>") || link.sourceId.startsWith("b<")) {
        siblingIds.push(link.sourceId);
      }
    } 
    if (link.sourceId === bubbleId) {
      if (link.targetId.startsWith("b>") || link.targetId.startsWith("b<")) {
        siblingIds.push(link.targetId);
      }
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

function conditionalUpdate(updateData, subgraph) {
  const graphData = forceGraphRef.graphData();
  const conditionalSubgraph = buildGraphData(updateData.replace);

  if (updateData.check.every(id => nodeDict.has(id) && nodeDict.get(id).active)) {
    updateData.check.forEach(id => { removeNode(id, graphData); });

    if (updateData.exclude) {
      updateData.exclude.forEach(id => { removeNode(id, subgraph); });
    }

    subgraph.nodes.push(...conditionalSubgraph.nodes);
    subgraph.links.push(...conditionalSubgraph.links);

    updateData.check.forEach(id => addToInsideNode(id, conditionalSubgraph.nodes));
    updateData.exclude.forEach(id => addToInsideNode(id, conditionalSubgraph.nodes));
  }
  return subgraph;
}

export function processPoppedSubgraph(bubbleId, rawSubgraph) {
  const graphData = forceGraphRef.graphData();

  const subgraph = buildGraphData(rawSubgraph);
  setPoppedContents(bubbleId, subgraph);
  removeNode(bubbleId, graphData);

  for (const updateData of rawSubgraph.update) {
    conditionalUpdate(updateData, subgraph);
  }

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
