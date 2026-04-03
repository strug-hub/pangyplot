import eventBus from '@event-bus';
import setUpGraphDataManager from './graph-data/graph-data-manager.js';
import appState from '../app-state.js';
import recordsManager  from './records/records-manager.js';
import viewState from './view-state.js';
import { createLinkElements } from './records/deserializer/deserializer-element.js';
import { recordPop, clearHistory } from '../../utils/pop-history.js';

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

  // Identify boundary segments shared with a still-popped sibling.
  // These segments must stay visible in D3 and unmapped in viewState.
  const exposedBoundarySegIds = new Set();
  for (const sibId of (bubbleRecord.siblings || [null, null])) {
    if (sibId == null) continue;
    const sibRecord = recordsManager.getNode("b" + sibId);
    if (!sibRecord || !sibRecord.popData) continue; // sibling not popped
    const sibBoundary = new Set(
      [...sibRecord.sourceSegs, ...sibRecord.sinkSegs]
    );
    for (const segId of [...bubbleRecord.sourceSegs, ...bubbleRecord.sinkSegs]) {
      if (sibBoundary.has(segId))
        exposedBoundarySegIds.add(segId);
    }
  }

  // Remove all descendant nodes from D3 (recursive for nested pops),
  // but skip boundary segments still needed by a popped sibling.
  const descendantIds = collectAllDescendantIds(bubbleRecord);
  for (const id of descendantIds) {
    if (exposedBoundarySegIds.has(id)) continue;
    forceGraph.removeNodeById(id);
  }

  // Restore viewState: unmap child bubble segs, re-register parent bubble segs.
  // Exclude shared boundary segs so the sibling's visible segments stay unmapped.
  viewState.collapse(bubbleRecord, bubbleRecord.sourceSegs, bubbleRecord.sinkSegs, insideSegs, childBubbles, exposedBoundarySegIds);

  // Restore external link records from pre-pop snapshots and regenerate D3 elements.
  // Skip links whose other end is a currently-popped bubble (target not in D3).
  const externalLinkElements = [];
  for (const snap of externalLinkSnapshots) {
    const otherId = snap.sourceId === bubbleId ? snap.targetId : snap.sourceId;
    if (otherId.startsWith("b")) {
      const otherRecord = recordsManager.getNode(otherId);
      if (otherRecord?.popData) continue;
    }
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
    clearHistory();
    recordPop('select', { genome, chromosome, start, end });

    const graphRecords = await recordsManager.getByCoordinate(coordinates);
    console.log("Fetched records:", graphRecords);
    if (!graphRecords) return;
    appState.coords = coordinates;

    const graphData = recordsManager.extractElementsFromRecords(graphRecords);
    forceGraph.replaceGraphData(graphData);

    eventBus.publish("graph:data-replaced", forceGraph);

  });
}
