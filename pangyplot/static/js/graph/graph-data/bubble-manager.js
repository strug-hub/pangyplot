let forceGraphRef = null;
const bubbles = new Map();

// BubbleRecord:
// {
//   id: string,
//   element: any,   // optional metadata
//   popped:   { nodes: Set<Node>, links: Set<Link> },
//   unpopped: { nodes: Set<Node>, links: Set<Link> }
// }

// Strategy hooks (can be overridden in init)
let getBubbleObj = (id, seedNode) => ({ id, seedNode });
let applyDiffs = defaultApplyDiffs;

export function initBubbleManager(forceGraph) {
    forceGraphRef = forceGraph;
    indexFromGraph();
}

export function indexFromGraph() {
  const graphData = forceGraphRef.graphData();
  const prev = new Map(bubbles);
  const bubbleNodes = (graphData.nodes).filter(n => n.type === 'bubble');

  const linkMap = {}; // nodeId -> Array<Link>
  for (const link of graphData.links) {
    const sid = link.sourceId;
    const tid = link.targetId;
    if (!linkMap[sid]) linkMap[sid] = [];
    linkMap[sid].push(link);
    if (!linkMap[tid]) linkMap[tid] = [];
    linkMap[tid].push(link);
  }

  for (const node of bubbleNodes) {
    const id = node.id;

    const unpoppedNodes = [node];
    const unpoppedLinks = linkMap[node.id] ?? [];

    const rec = {
      id,
      element: node,
      popped: {},
      unpopped: {
        nodes: unpoppedNodes,
        links: unpoppedLinks
      }
    };
    bubbles.set(id, rec);
  }
  console.log("Indexed", bubbles);
  return bubbles;
}

export function setPoppedContents(bubbleId, subgraph) {
  const rec = bubbles.get(bubbleId);
  rec.popped = subgraph;
}

export function getUnpoppedContents(bubbleId) {
  const rec = bubbles.get(bubbleId);
  return rec ? rec.unpopped : null;
}

export function getPoppedContents(bubbleId) {
  const rec = bubbles.get(bubbleId);
  return rec ? rec.popped : null;
}

/** Toggle a bubble between popped/unpopped */
export function toggleBubble(bubbleId, { reheat = true } = {}) {
  const rec = bubbles.get(bubbleId);
  if (!rec) return;
  const diffs = rec.isPopped ? collapseDiffs(rec) : popDiffs(rec);
  applyDiffs(forceGraphRef, diffs, rec);
  rec.isPopped = !rec.isPopped;
  if (reheat) reheatSim();
}

/** Pop a bubble explicitly */
export function popBubble(bubbleId, { reheat = true } = {}) {
  const rec = bubbles.get(bubbleId);
  if (!rec || rec.isPopped) return;
  applyDiffs(forceGraphRef, popDiffs(rec), rec);
  rec.isPopped = true;
  if (reheat) reheatSim();
}

/** Collapse a bubble explicitly */
export function collapseBubble(bubbleId, { reheat = true } = {}) {
  const rec = bubbles.get(bubbleId);
  if (!rec || !rec.isPopped) return;
  applyDiffs(forceGraphRef, collapseDiffs(rec), rec);
  rec.isPopped = false;
  if (reheat) reheatSim();
}

/** Iterators & accessors */
export function *iterateBubbles() { yield* bubbles.values(); }
export function getBubbleRecord(id) { return bubbles.get(id) ?? null; }
export function hasBubble(id) { return bubbles.has(id); }
export function bubbleIds() { return bubbles.keys(); }
export function bubbleCount() { return bubbles.size; }

/* ----------------- internals ----------------- */

function popDiffs(rec) {
  return {
    removeNodes: [...rec.unpoppedNodes],
    removeLinks: [...rec.unpoppedLinks],
    addNodes: [...rec.poppedNodes],
    addLinks: [...rec.poppedLinks]
  };
}

function collapseDiffs(rec) {
  return {
    removeNodes: [...rec.poppedNodes],
    removeLinks: [...rec.poppedLinks],
    addNodes: [...rec.unpoppedNodes],
    addLinks: [...rec.unpoppedLinks]
  };
}

function reheatSim() {
  try {
    forceGraphRef?.d3ReheatSimulation?.();
    forceGraphRef?.autoPauseRedraw?.(false);
  } catch (_) {}
}

function defaultApplyDiffs(forceGraph, diffs) {
  const gd = forceGraph.graphData();
  // Maintain object identity for nodes/links already present
  const nodeSet = new Set(gd.nodes);
  const linkSet = new Set(gd.links);

  for (const n of diffs.removeNodes ?? []) nodeSet.delete(n);
  for (const l of diffs.removeLinks ?? []) linkSet.delete(l);
  for (const n of diffs.addNodes ?? []) nodeSet.add(n);
  for (const l of diffs.addLinks ?? []) linkSet.add(l);

  const next = { nodes: [...nodeSet], links: [...linkSet] };
  forceGraph.graphData(next);
}
