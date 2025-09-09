import eventBus from '../../utils/event-bus.js';
import setUpGraphDataManager from './graph-data/graph-data-manager.js';
import { deserializeGraph } from './deserialize/deserialize-graph.js';
import forceGraph from '../force-graph.js';
import { cleanGraph } from './graph-data/graph-data-integrity.js';
import DEBUG_MODE from '../../debug-mode.js';
import { fetchCoordinateRange } from './fetch/fetch-coordinate-range.js';
import { getNodeRecord, getConnectingLinkRecords, setAllInactive, setActive } from './records/records-manager.js';

// TODO: AS LONG AS WE HAVE A VALID SET OF NODES WE CAN RETRIEVE THEIR LINKS

export function addInsideContents(id, subgraph) {
  const nodeRecord = getNodeRecord(id);
  if (!nodeRecord) return;

  const insideSet = nodeRecord.inside;
  for (const element of subgraph.nodes) {
    insideSet.add(element);
  }
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
    if (link.record.isSelfDestructLink) {

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
        const endSubgraph = deserializeGraph(endData);
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

function replaceData(forceGraph, rawGraph) {
  const graphData = deserializeGraph(rawGraph);

  if (DEBUG_MODE) {
    console.log("Creating force graph with data:", graphData);
  }

  forceGraph.clearGraphData();
  forceGraph.addGraphData(graphData);
  
  eventBus.publish("graph:data-replaced", forceGraph);
}

export function setUpDataManager(forceGraph) {
  setUpGraphDataManager(forceGraph);

  eventBus.subscribe("ui:construct-graph", async function (data) {
    const { genome, chromosome, start, end } = data;
    const coordinates = { genome, chromosome, start, end };
    if (forceGraph.equalsCoords(coordinates)) return;

    const rawGraph = await fetchCoordinateRange(coordinates);
    if (!rawGraph) return;
    forceGraph.coords = coordinates;
    replaceData(forceGraph, rawGraph);

  });
}

