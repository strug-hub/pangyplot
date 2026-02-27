/** Sizes of the four internal lookup maps */
export async function getLookupSizes(page) {
  return page.evaluate(() => ({
    nodes: window._lookups.nodeRecordLookup.size,
    links: window._lookups.linkRecordLookup.size,
    adjacency: window._lookups.nodeAdjacencyLookup.size,
    genes: window._lookups.geneRecordLookup.size,
  }));
}

/** Number of segment→node entries in viewState */
export async function getViewStateSize(page) {
  return page.evaluate(() => window._viewState.segmentToNode.size);
}

/** Get a node record's key properties (null if not found) */
export async function getNodeRecord(page, id) {
  return page.evaluate((nodeId) => {
    const r = window._recordsManager.getNode(nodeId);
    if (!r) return null;
    return {
      id: r.id,
      type: r.type,
      active: r.active,
      seqLength: r.seqLength,
      insideCount: r.inside?.size ?? 0,
      hasPopData: !!(r.popData),
      hasElements: r.hasElements(),
      nodeElCount: r.elements?.nodes?.length ?? 0,
      linkElCount: r.elements?.links?.length ?? 0,
      coords: r.coords,
      // bubble-specific
      sourceSegs: r.sourceSegs ?? null,
      sinkSegs: r.sinkSegs ?? null,
      siblings: r.siblings ?? null,
      chain: r.chain ?? null,
    };
  }, id);
}

/** Get a link record's key properties (null if not found) */
export async function getLinkRecord(page, id) {
  return page.evaluate((linkId) => {
    const r = window._recordsManager.getLink(linkId);
    if (!r) return null;
    return {
      id: r.id,
      sourceId: r.sourceId,
      targetId: r.targetId,
      type: r.type,
      isChainLink: r.isChainLink,
      incomplete: r.isIncomplete(),
      hasElements: r.hasElements(),
      isDel: r.isDel,
    };
  }, id);
}

/** Get IDs of all node records currently in the lookup */
export async function getAllNodeRecordIds(page) {
  return page.evaluate(() =>
    [...window._lookups.nodeRecordLookup.keys()]
  );
}

/** Get IDs of all link records currently in the lookup */
export async function getAllLinkRecordIds(page) {
  return page.evaluate(() =>
    [...window._lookups.linkRecordLookup.keys()]
  );
}

/** Get the adjacency set (link IDs) for a given node ID */
export async function getAdjacency(page, nodeId) {
  return page.evaluate((id) => {
    const set = window._lookups.nodeAdjacencyLookup.get(id);
    return set ? [...set] : [];
  }, nodeId);
}

/** Resolve a segment ID through viewState (returns owning node ID or null) */
export async function resolveSegment(page, segId) {
  return page.evaluate((sid) => {
    const record = window._viewState.resolve(sid);
    return record ? record.id : null;
  }, segId);
}

/** Get all viewState entries as {segId, nodeId} pairs */
export async function getViewStateEntries(page) {
  return page.evaluate(() =>
    [...window._viewState.segmentToNode.entries()].map(
      ([segId, record]) => ({ segId, nodeId: record.id })
    )
  );
}

/** Check that every node record has elements (nodes array non-empty) */
export async function allNodeRecordsHaveElements(page) {
  return page.evaluate(() =>
    [...window._lookups.nodeRecordLookup.values()].every(
      r => r.elements?.nodes?.length > 0
    )
  );
}

/** Check that every complete link record has elements */
export async function allCompleteLinkRecordsHaveElements(page) {
  return page.evaluate(() =>
    [...window._lookups.linkRecordLookup.values()]
      .filter(r => !r.isIncomplete())
      .every(r => r.elements?.links?.length > 0)
  );
}

/** Get bubble IDs that have non-null popData (i.e. are currently popped) */
export async function getPoppedBubbleIds(page) {
  return page.evaluate(() =>
    [...window._lookups.nodeRecordLookup.values()]
      .filter(r => r.type === 'bubble' && r.popData)
      .map(r => r.id)
  );
}

/** Count node records by type */
export async function getRecordCountsByType(page) {
  return page.evaluate(() => {
    const counts = { bubble: 0, segment: 0 };
    for (const r of window._lookups.nodeRecordLookup.values()) {
      counts[r.type] = (counts[r.type] || 0) + 1;
    }
    return counts;
  });
}

/** Check that D3 graphData nodes are a subset of records (every displayed node has a record) */
export async function allGraphNodesHaveRecords(page) {
  return page.evaluate(() => {
    const nodes = window._forceGraph.graphData().nodes;
    return nodes.every(n => window._lookups.nodeRecordLookup.has(n.id));
  });
}
