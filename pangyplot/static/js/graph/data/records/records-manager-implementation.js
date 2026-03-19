import { isDebugMode } from '@app-state';
import eventBus from '@event-bus';
import { installRecordsInspector } from "./records-manager-ui.js";

export const nodeRecordLookup = new Map();
export const linkRecordLookup = new Map();
export const nodeAdjacencyLookup = new Map();

export const geneRecordLookup = new Map();

export function clearRecordsManager() {
  nodeRecordLookup.clear();
  linkRecordLookup.clear();
  nodeAdjacencyLookup.clear();
  geneRecordLookup.clear();
}

export function getNodeRecord(id) {
  return nodeRecordLookup.get(id) || null;
}

export function getLinkRecord(id, allowIncomplete = false) {
  const linkRecord = linkRecordLookup.get(id) || null;
  if (!linkRecord || (linkRecord.isIncomplete() && !allowIncomplete)) return null;
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
  const records = nodeRecords.map(newRecord => {
    const existing = getNodeRecord(newRecord.id);
    if (existing) {
      existing.coords = newRecord.coords;
      return existing;
    }
    return newRecord;
  });
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

// Records inspector: lazily installed, toggled via floating button
let inspector = null;

const inspectorBtn = document.createElement('button');
inspectorBtn.id = 'records-inspector-toggle';
inspectorBtn.innerHTML = '<i class="fa-solid fa-database"></i>';
inspectorBtn.title = 'Records Inspector';
inspectorBtn.style.cssText = `
    display: none; position: fixed; bottom: 16px; right: 16px; z-index: 9999;
    width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
    background: var(--darker-green); color: var(--lighter-green);
    font-size: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    transition: background 0.2s;
`;
inspectorBtn.addEventListener('mouseenter', () => { inspectorBtn.style.background = 'var(--highlight)'; inspectorBtn.style.color = 'var(--text-color)'; });
inspectorBtn.addEventListener('mouseleave', () => { inspectorBtn.style.background = 'var(--darker-green)'; inspectorBtn.style.color = 'var(--lighter-green)'; });
inspectorBtn.addEventListener('click', () => {
    if (!inspector) {
        inspector = installRecordsInspector({
            onHighlightNode: (id) => { console.log('Highlight node', id); }
        });
    }
    inspector.open();
});
document.body.appendChild(inspectorBtn);

if (isDebugMode()) inspectorBtn.style.display = '';

eventBus.subscribe('app:debug-mode-changed', (enabled) => {
    inspectorBtn.style.display = enabled ? '' : 'none';
    if (!enabled && inspector) inspector.close();
});
