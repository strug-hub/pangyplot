import eventBus from '../../utils/event-bus.js';
import setUpGraphDataManager from './graph-data/graph-data-manager.js';
import forceGraph from '../force-graph.js';
import { cleanGraph } from './graph-data/graph-data-integrity.js';
import recordsManager  from './records/records-manager.js';

// TODO: AS LONG AS WE HAVE A VALID SET OF NODES WE CAN RETRIEVE THEIR LINKS

export function addInsideContents(id, subgraph) {
  const nodeRecord = recordsManager.getNode(id);
  if (!nodeRecord) return;

  const insideSet = nodeRecord.inside;
  for (const element of subgraph.nodes) {
    insideSet.add(element);
  }
}




function getUnpoppedContents(bubbleId) {
  const bubbleRecord = recordsManager.getNode(bubbleId)
  const nodes = Array.from(bubbleRecord.nodeElements);
  const links = getLinkElements(bubbleId);

  links.push(...bubbleRecord.linkElements);

  return { nodes, links };
}

function getPoppedContents(bubbleId, recursive = false) {
  const bubbleRecord = recordsManager.getNode(bubbleId);
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

      for (const elem of recordsManager.getNode(sibId).inside) {
        if (recordsManager.getNode(elem.id).active) {
          flag = true;
          break;
        }
      }

      if (flag) {
        if (recordsManager.getNode(sibId)) {
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

export function updateForceGraph(graphData) {
  cleanGraph(graphData);

  setAllInactive();

  graphData.nodes.forEach(node => {
    //setActive(node.id);
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
  const nodeRecord = recordsManager.getNode(id);
  return nodeRecord != null && nodeRecord.active;
}

export function getNodeElements(id) {
  const nodeRecord = recordsManager.getNode(id);
  return nodeRecord != null ? Array.from(nodeRecord.elements.nodes) : [];
}
export function getInsideNodeElements(id) {
  const nodeRecord = recordsManager.getNode(id);
  const insideElements = [];
  for (const record of nodeRecord.inside) {
    insideElements.push(...record.elements.nodes);
  }
  return insideElements;
}


export function getLinkElements(nodeId) {
  const connectingLinks = recordsManager.getLinks(nodeId);
  const linkElements = [];
  for (const linkRecord of connectingLinks) {

    linkElements.push(...linkRecord.elements.links);
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


export function setUpDataManager(forceGraph) {
  setUpGraphDataManager(forceGraph);

  eventBus.subscribe("ui:construct-graph", async function (data) {
    const { genome, chromosome, start, end } = data;
    const coordinates = { genome, chromosome, start, end };
    if (forceGraph.equalsCoords(coordinates)) return;

    const graphRecords = await recordsManager.getByCoordinate(coordinates);
    console.log("Fetched records:", graphRecords);
    if (!graphRecords) return;
    forceGraph.coords = coordinates;
    forceGraph.replaceRecords(graphRecords);
    eventBus.publish("graph:data-replaced", forceGraph);

  });
}

