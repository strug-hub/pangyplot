import { installRecordsInspector } from "./records-manager-ui.js";
import { createLinkElements } from "./deserializer/deserializer-element.js";

export const nodeRecordLookup = new Map();
export const linkRecordLookup = new Map();
export const nodeAdjacencyLookup = new Map();

export const geneRecordLookup = new Map();

export function clearRecordsManager() {
  nodeRecordLookup.clear();
  linkRecordLookup.clear();
  nodeAdjacencyLookup.clear();
}

export function getNodeRecord(id) {
  return nodeRecordLookup.get(id) || null;
}

export function getLinkRecord(id, allowIncomplete = false) {
  const linkRecord = linkRecordLookup.get(id) || null;
  if (!linkRecord || (linkRecord.isIncomplete() && !allowIncomplete)) return null;
  if (!linkRecord.hasElements()) {
    linkRecord.elements = createLinkElements(linkRecord);
  }
  return linkRecord;
}

export function getGeneRecord(id) {
  return geneRecordLookup.get(id) || null;
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

export function updateExistingNodeRecords(nodeRecords, parentId = null) {
  const records = nodeRecords.map(r => getNodeRecord(r.id) || r);
  records.forEach(r => nodeRecordLookup.set(r.id, r));

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

export function updateExistingLinkRecords(linkRecords) {
  const records = linkRecords.map(r => getLinkRecord(r.id, true) || r);
  records.forEach(r => linkRecordLookup.set(r.id, r));
  records.forEach(r => ensureNodeAdjacency(r));
  return records;
}

export function updateExistingGeneRecords(geneRecords) {
  const records = geneRecords.map(r => getGeneRecord(r.id) || r);
  records.forEach(r => geneRecordLookup.set(r.id, r));
  return records;
}

export function getChildSubgraph(nodeId) {

  const parentRecord = getNodeRecord(nodeId);
  if (parentRecord === null) return null;

  const nodeRecords = parentRecord.childRecords;
  const linkRecords = nodeRecords
    .flatMap(c => getConnectingLinkRecords(c.id));

  return { nodes: nodeRecords, links: linkRecords};
}

const inspector = installRecordsInspector({
  onHighlightNode: (id) => {
    console.log('Highlight node', id);
  }
});
