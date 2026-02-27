import eventBus from '../../utils/event-bus.js';
import setUpGraphDataManager from './graph-data/graph-data-manager.js';
import appState from '../app-state.js';
import recordsManager  from './records/records-manager.js';
import viewState from './view-state.js';
import { createLinkElements } from './records/deserializer/deserializer-element.js';

function collectAllDescendantIds(record) {
  const ids = [];
  for (const child of record.inside) {
    ids.push(child.id);
    ids.push(...collectAllDescendantIds(child));
  }
  return ids;
}

export function unpopBubble(bubbleId, forceGraph) {
  const bubbleRecord = recordsManager.getNode(bubbleId);
  if (!bubbleRecord || !bubbleRecord.popData) return;

  const { childBubbles, insideSegs, externalLinkSnapshots } = bubbleRecord.popData;

  // Remove all descendant nodes from D3 (recursive for nested pops)
  const descendantIds = collectAllDescendantIds(bubbleRecord);
  for (const id of descendantIds) {
    forceGraph.removeNodeById(id);
  }

  // Restore viewState: unmap child bubble segs, re-register parent bubble segs
  viewState.collapse(bubbleRecord, bubbleRecord.sourceSegs, bubbleRecord.sinkSegs, insideSegs, childBubbles);

  // Restore external link records from pre-pop snapshots and regenerate D3 elements
  const externalLinkElements = [];
  for (const snap of externalLinkSnapshots) {
    const linkRecord = recordsManager.getLink(snap.id);
    if (!linkRecord) continue;
    linkRecord.sourceId = snap.sourceId;
    linkRecord.targetId = snap.targetId;
    linkRecord.sourceRecord = snap.sourceRecord;
    linkRecord.targetRecord = snap.targetRecord;
    linkRecord.elements = createLinkElements(linkRecord);
    externalLinkElements.push(...linkRecord.elements.links);
  }

  // Add bubble node + restored external links back to D3
  forceGraph.addGraphData({
    nodes: bubbleRecord.elements.nodes,
    links: [...bubbleRecord.elements.links, ...externalLinkElements],
  });

  // Clean up: clear children and undo data
  bubbleRecord.inside.clear();
  bubbleRecord.popData = null;

  eventBus.publish('graph:bubble-unpopped', { id: bubbleId });
}

export function isNodeActive(id) {
  const nodeRecord = recordsManager.getNode(id);
  return nodeRecord != null && nodeRecord.active;
}

export function getInsideNodeElements(id) {
  const nodeRecord = recordsManager.getNode(id);
  const insideElements = [];
  for (const record of nodeRecord.inside) {
    insideElements.push(...record.elements.nodes);
  }
  return insideElements;
}

export function setUpDataManager(forceGraph) {
  setUpGraphDataManager(forceGraph);

  eventBus.subscribe("ui:construct-graph", async function (data) {
    const { genome, chromosome, start, end } = data;
    const coordinates = { genome, chromosome, start, end };

    const graphRecords = await recordsManager.getByCoordinate(coordinates);
    console.log("Fetched records:", graphRecords);
    if (!graphRecords) return;
    appState.coords = coordinates;

    const graphData = recordsManager.extractElementsFromRecords(graphRecords);
    forceGraph.replaceGraphData(graphData);

    eventBus.publish("graph:data-replaced", forceGraph);

  });
}
