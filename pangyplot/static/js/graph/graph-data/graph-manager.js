import buildGraphData from './graph-data.js';
import { cleanGraph } from './graph-integrity.js';

let forceGraphRef = null;

// TODO: DON'T ADD DUPLICATES!
const nodeDict = new Map();
const nodeIdDict = new Map();
const linkDict = new Map();

function initializeNodeRecord(id) {
  if (nodeDict.has(id)) return;
  const record = {
    id,
    elements: [],
    inside: [],
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
  nodeDict.get(id).elements.push(element);
  nodeIdDict.set(id, element);
}

export function addToInsideNode(id, insideElements) {
  if (!nodeDict.has(id)) {
    initializeNodeRecord(id);
  }

  nodeDict.get(id).inside.push(...insideElements);
}

function initializeLinkRecord(id) {
  if (linkDict.has(id)) return;
  const record = [];
  linkDict.set(id, record);
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
  linkDict.get(toId).push(element);
  linkDict.get(fromId).push(element);
}

export function clearGraphManager() {
  nodeDict.clear();
  linkDict.clear();
  nodeIdDict.clear();
}

export function setUpGraphManager(forceGraph) {
  forceGraphRef = forceGraph;
}

export function setPoppedContents(bubbleId, subgraph) {
  const bubble = nodeDict.get(bubbleId);
  for (const node of subgraph.nodes) {
    addNodeRecord(node);
    bubble.inside.push(node);
  }
  for (const link of subgraph.links) {
    addLinkRecord(link);
  }
}

function getUnpoppedContents(bubbleId) {
  const bubble = nodeDict.get(bubbleId);
  const nodes = [];
  const links = [];

  nodes.push(...bubble.elements);
  for (const element of bubble.elements) {
    links.push(...linkDict.get(element.id) || []);
  }

  return { nodes, links };
}

function getPoppedContents(bubbleId, recursive = false) {
  const bubble = nodeDict.get(bubbleId);
  const nodes = [];
  const links = [];

  for (const element of bubble.inside) {
    nodes.push(element);
    links.push(...linkDict.get(element.id) || []);

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
    const siblingIds = []

    if (link.targetId === bubbleId) {
      if (link.sourceId.startsWith("b>") || link.sourceId.startsWith("b<")) {
        siblingIds.push(link.sourceId);
      }
    } if (link.sourceId === bubbleId) {
      if (link.targetId.startsWith("b>") || link.targetId.startsWith("b<")) {
        siblingIds.push(link.targetId);
      }
    }

    // check if the internal end segments are in the graph
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
          recoverData.nodes.push(...nodeDict.get(sibId).elements);
          recoverData.links.push(...linkDict.get(sibId) || []);
        }
      }
    }
  }

  for (const node of poppedContents.nodes) {
    removeNode(node.id, graphData);
  }

  console.log("recovery data:", recoverData);
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

  // Check if all node ids in update.check are in graph
  if (updateData.check.every(id => nodeDict.has(id) && nodeDict.get(id).active)) {
    updateData.check.forEach(id => { removeNode(id, graphData); });

    // Remove nodes with id in update.exclude from rawSubgraph
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

  // Some nodes and links are conditionally included based on the current graph state.
  for (const updateData of rawSubgraph.update) {
    conditionalUpdate(updateData, subgraph);
  }

  graphData.nodes.push(...subgraph.nodes);
  graphData.links.push(...subgraph.links);

  updateForceGraph(graphData);
  return subgraph;
}

/** Iterators & accessors */
export function* iterateBubbles() { yield* bubbles.values(); }
export function getBubbleRecord(id) { return bubbles.get(id) ?? null; }
export function hasBubble(id) { return bubbles.has(id); }
export function bubbleIds() { return bubbles.keys(); }
export function bubbleCount() { return bubbles.size; }

export function updateForceGraph(graphData) {

  cleanGraph(graphData);

  for (const node of nodeDict.values()) {
    node.active = false;
  }
  graphData.nodes.forEach(node => {
    nodeDict.get(node.id).active = true;
  });

  forceGraphRef.graphData(graphData);
}

export function getNodeElement(nodeId) {
  if (nodeIdDict.has(nodeId)) {
    return nodeIdDict.get(nodeId);
  } else {
    return null;
  }
}

export function getNodeElements(id) {
  if (nodeDict.has(id)) {
    return nodeDict.get(id).elements;
  } else {
    return [];
  }
}
