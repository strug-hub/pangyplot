const nodeRecords = new Map();
const linkRecords = new Map();
const nodeIdToLinkRecords = new Map();

export function addNodeRecord(nodeRecord) {
  nodeRecords.set(nodeRecord.id, nodeRecord);
}

export function addLinkRecord(linkRecord) {
  linkRecords.set(linkRecord.id, linkRecord);
}

export function clearRecordsManager() {
  nodeRecords.clear();
  linkRecords.clear();
  nodeIdToLinkRecords.clear();
}

export function getNodeRecord(id) {
  return nodeRecords.get(id) || null;
}

export function getLinkRecord(id) {
  return linkRecords.get(id) || null;
}

export function setAllInactive() {
  for (const record of nodeRecords.values()) {
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
  const links = nodeIdToLinkRecords.get(nodeId) || new Set();
  return Array.from(links).filter(record => !record.isIncomplete());
}

export function updateExistingNodeRecords(nodeRecords) {
  const records = [];

  for (const record of nodeRecords) {
    const existingRecord = getNodeRecord(record.id);

    if (existingRecord === null) {
      nodeIdToLinkRecords.set(record.id, new Set());
      addNodeRecord(record);
      records.push(record);
    } else {
      records.push(existingRecord);
    }
  }
  return records;
}

function tryToCompleteLinkRecord(linkRecord){
  if (linkRecord.sourceRecord === null) {
    linkRecord.sourceRecord = getNodeRecord(linkRecord.sourceId);
  }
  if (linkRecord.targetRecord === null) {
    linkRecord.targetRecord = getNodeRecord(linkRecord.targetId);
  }
}

export function updateExistingLinkRecords(linkRecords) {
  const records = [];

  for (const record of linkRecords) {
    const existingRecord = getLinkRecord(record.id);
    let targetRecord = existingRecord;

    if (existingRecord === null) {
      addLinkRecord(record);
      targetRecord = record;

      //todo: check if a problem when incomplete
      const toId = targetRecord.targetId;
      const fromId = targetRecord.sourceId;

      if (!nodeIdToLinkRecords.has(toId)) {
        nodeIdToLinkRecords.set(toId, new Set());
      }
      if (!nodeIdToLinkRecords.has(fromId)) {
        nodeIdToLinkRecords.set(fromId, new Set());
      }
      nodeIdToLinkRecords.get(toId).add(targetRecord);
      nodeIdToLinkRecords.get(fromId).add(targetRecord);
    }

    if (targetRecord.isIncomplete()) {
      tryToCompleteLinkRecord(targetRecord);
    }
    records.push(targetRecord);
  }

  return records;
}