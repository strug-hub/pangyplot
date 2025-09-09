import { installRecordsInspector } from "./records-manager-ui.js";
import { createLinkElements } from "./deserializer/deserializer-element.js";

export const nodeRecordLookup = new Map();
export const linkRecordLookup = new Map();
export const nodeAdjacencyLookup = new Map();
const danglingLinks = new Map();

export function clearRecordsManager() {
  nodeRecordLookup.clear();
  linkRecordLookup.clear();
  nodeAdjacencyLookup.clear();
  danglingLinks.clear();
}

export function getNodeRecord(id) {
  return nodeRecordLookup.get(id) || null;
}

export function getLinkRecord(id) {
  const linkRecord = linkRecordLookup.get(id) || null;
  if (!linkRecord || linkRecord.isIncomplete()) return null;
  if (!linkRecord.hasElements()) {
    linkRecord.elements = createLinkElements(linkRecord);
  }
  return linkRecord;
}

export function setAllInactive() {
  for (const record of nodeRecordLookup.values()) {
    record.active = false;
  }
}
export function setActive(id) {
  const record = getNodeRecord(id);
  if (record) {
    record.active = true;
  }
}

export function getConnectingLinkRecords(nodeId) {
  const linkIds = nodeAdjacencyLookup.get(nodeId);
  if (!linkIds) return [];
  const out = [];
  for (const id of linkIds) {
    const record = getLinkRecord(id);
    if (record === null) continue;
    out.push(record);
  }
  return out;
}

function checkForDanglingLink(nodeRecord) {
  if (danglingLinks.has(nodeRecord.id)) {
    const links = danglingLinks.get(nodeRecord.id);
    for (const linkRecord of links) {
      if (linkRecord.sourceId === nodeRecord.id) {
        linkRecord.sourceRecord = nodeRecord;
      }
      if (linkRecord.targetId === nodeRecord.id) {
        linkRecord.targetRecord = nodeRecord;
      }
    }
    danglingLinks.delete(nodeRecord.id);
  }
}

export function updateExistingNodeRecords(nodeRecords, parentId = null) {
  const records = nodeRecords.map(r => getNodeRecord(r.id) || r);
  records.forEach(r => nodeRecordLookup.set(r.id, r));
  records.forEach(r => checkForDanglingLink(r));

  if (parentId !== null && nodeRecordLookup.has(parentId)) {
    const parentRecord = getNodeRecord(parentId);
    for (const r of records) parentRecord.inside.add(r);
  }

  return records;
}

function ensureNodeAdjacency(linkRecord) {
  if (!nodeAdjacencyLookup.has(linkRecord.sourceId))
    nodeAdjacencyLookup.set(linkRecord.sourceId, new Set());
  if (!nodeAdjacencyLookup.has(linkRecord.targetId))
    nodeAdjacencyLookup.set(linkRecord.targetId, new Set());

  nodeAdjacencyLookup.get(linkRecord.sourceId).add(linkRecord.id);
  nodeAdjacencyLookup.get(linkRecord.targetId).add(linkRecord.id);
}

function addDanglingLink(nodeId, linkRecord) {
  if (!danglingLinks.has(nodeId)) danglingLinks.set(nodeId, new Set());
  danglingLinks.get(nodeId).add(linkRecord);
}

function tryToCompleteLinkRecord(linkRecord) {
  if (linkRecord.sourceRecord === null) {
    const src = getNodeRecord(linkRecord.sourceId);
    if (src !== null) linkRecord.sourceRecord = src;
    else addDanglingLink(linkRecord.sourceId, linkRecord);
  }
  if (linkRecord.targetRecord === null) {
    const tgt = getNodeRecord(linkRecord.targetId);
    if (tgt !== null) linkRecord.targetRecord = tgt;
    else addDanglingLink(linkRecord.targetId, linkRecord);
  }
}

export function updateExistingLinkRecords(linkRecords) {
  const records = linkRecords;
  records.forEach(r => linkRecordLookup.set(r.id, r));
  records.forEach(r => ensureNodeAdjacency(r));

  records.forEach(r => { tryToCompleteLinkRecord(r); });

  return records;
}

export async function getChildSubgraph(nodeId) {

  //check records first, get bubble if can't find
  //await fetchBubbleSubgraph(nodeId);

  const bubbleData = await fetchBubbleSubgraph(nodeId);
  if (bubbleData) return bubbleData;

  const parentRecord = getNodeRecord(nodeId);
  if (parentRecord === null) return { nodes: [], links: [] };

  const nodeRecords = parentRecord.childRecords;
  const linkRecords = nodeRecords
    .flatMap(c => getConnectingLinkRecords(c.id));

  const nodes = [...nodeRecords, ...linkRecords].map(r => r.elements.nodes).flat();
  const links = [...nodeRecords, ...linkRecords].map(r => r.elements.links).flat();

  return { nodes, links };
}

const inspector = installRecordsInspector({
  onHighlightNode: (id) => {
    // optional: hook into your force graph selection/highlight
    // e.g., select node, pan to it, etc.
    console.log('Highlight node', id);
  }
});