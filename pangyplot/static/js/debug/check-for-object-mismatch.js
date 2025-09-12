import recordsManager from "../graph/data/records/records-manager.js";
import forceGraph from "../graph/force-graph.js";

export function checkForObjectMismatch(graphData=null) {
    console.log("Comparing records to graph elements...");
    const nodeElements = {}

    if (!graphData) {
        graphData = forceGraph.graphData();
    }

    for (const node of graphData.nodes) {
        if (!nodeElements[node.id]) nodeElements[node.id] = [];
        nodeElements[node.id].push(node);
    }

    for (const nodeId in nodeElements) {
        const record = recordsManager.getNode(nodeId);
        const recordElements = record.elements.nodes.sort((a, b) => a.iid - b.iid);
        const graphElements = nodeElements[nodeId].sort((a, b) => a.iid - b.iid);

        if (recordElements.length !== graphElements.length) {
            console.warn("Node record mismatch (length) for", nodeId, recordElements.length, "vs", graphElements.length);
            continue;
        }
        for (let i = 0; i < recordElements.length; i++) {
            if (recordElements[i] !== graphElements[i]) {
                console.warn("Node element mismatch for", nodeId, recordElements[i].iid, "vs", graphElements[i].iid);
            }
        }
    }
}


// Audit circular refs: element.record <-> record.elements
export function auditRecordElementCircular(forceGraph, { requireGraphCanonical = true } = {}) {
  const issues = [];

  const data = forceGraph.graphData();
  const allElements = [...data.nodes, ...data.links];

  // Fast lookup for canonical graph elements by iid
  const byIid = new Map(allElements.map(e => [String(e.iid), e]));

  // Collect unique records encountered via elements
  const seenRecords = new Set();

  // ---- Pass 1: element -> record consistency ----
  for (const el of allElements) {
    const kind = el.isNode ? "node" : el.isLink ? "link" : "unknown";
    const rec = el.record;

    if (!rec) {
      issues.push({ type: "missing-record", kind, iid: el.iid, id: el.id, el });
      continue;
    }
    seenRecords.add(rec);

    const bucket =
      el.isNode ? (rec.elements?.nodes ?? []) :
      el.isLink ? (rec.elements?.links ?? []) : [];

    // Must contain the exact same object reference
    const inBucket = bucket.some(x => x === el);
    if (!inBucket) {
      issues.push({
        type: "record-missing-element-ref",
        kind,
        recordId: rec.id,
        iid: el.iid,
        id: el.id,
        el,
        note: "record.elements does not contain this element by reference"
      });
    }
  }

  // ---- Pass 2: record -> element consistency ----
  for (const rec of seenRecords) {
    const nodes = rec.elements?.nodes ?? [];
    const links = rec.elements?.links ?? [];

    // duplicates by iid inside record arrays
    const dupCheck = (arr, kind) => {
      const seen = new Map();
      for (const e of arr) {
        const key = String(e.iid);
        const prev = seen.get(key);
        if (prev && prev !== e) {
          issues.push({
            type: "duplicate-iid-different-refs-in-record",
            kind, recordId: rec.id, iid: key, a: prev, b: e
          });
        }
        if (!prev) seen.set(key, e);
      }
    };
    dupCheck(nodes, "node");
    dupCheck(links, "link");

    const checkBackref = (e, kind) => {
      if (e.record !== rec) {
        issues.push({
          type: "element-points-to-different-record",
          kind, recordId: rec.id, iid: e.iid, id: e.id, el: e, actualRecordId: e.record?.id
        });
      }
      if (requireGraphCanonical) {
        const canonical = byIid.get(String(e.iid));
        if (!canonical) {
          issues.push({
            type: "record-element-not-in-graph",
            kind, recordId: rec.id, iid: e.iid, id: e.id, el: e
          });
        } else if (canonical !== e) {
          issues.push({
            type: "record-element-not-canonical",
            kind, recordId: rec.id, iid: e.iid, id: e.id, recordEl: e, graphEl: canonical
          });
        }
      }
    };

    for (const e of nodes) checkBackref(e, "node");
    for (const e of links) checkBackref(e, "link");
  }

  // Optional summary
  if (issues.length) {
    console.warn(`[audit] circular ref issues: ${issues.length}`, issues.slice(0, 20));
  } else {
    console.log("[audit] circular ref OK");
  }

  return { ok: issues.length === 0, issues };
}

