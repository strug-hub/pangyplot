let forceGraphRef = null;
const bubbles = new Map();

// State: bubbleId -> record
// record = {
//   id,
//   bubble,               // metadata/object for this bubble
//   isPopped: false,
//   unpoppedNodes: Set<Node>,
//   unpoppedLinks: Set<Link>,
//   poppedNodes: Set<Node>,
//   poppedLinks: Set<Link>,
//   poppedBubbles: Set<string>, // optional nested bubbles
// }

// Strategy hooks (can be overridden in init)
let getBubbleObj = (id, seedNode) => ({ id, seedNode });
let applyDiffs = defaultApplyDiffs;

export function initBubbleManager(forceGraph) {
    forceGraphRef = forceGraph;
    indexFromGraph()
}

/** Build/refresh bubble index from the graph */
export function indexFromGraph() {
  const graphData = forceGraphRef.graphData();
  
  const prev = new Map(bubbles);
  bubbles.clear();

  // Group nodes by bubble id
  const nodeGroups = new Map();
  for (const node of (graphData.nodes)) {
    if (node.type !== 'bubble') continue;

    const bid = node.id;
    if (!nodeGroups.has(bid)) nodeGroups.set(bid, []);
    nodeGroups.get(bid).push(node);
  }

  // Recreate/merge records
  for (const [bid, groupNodes] of nodeGroups) {
    const old = prev.get(bid);
    const rec = old ?? {
      id: bid,
      bubble: getBubbleObj(bid, groupNodes[0]),
      isPopped: false,
      unpoppedNodes: new Set(),
      unpoppedLinks: new Set(),
      poppedNodes: new Set(),
      poppedLinks: new Set(),
      poppedBubbles: new Set()
    };
    rec.unpoppedNodes = new Set(groupNodes);
    rec.unpoppedLinks = new Set(); // filled below
    bubbles.set(bid, rec);
  }

  // Attach links internal to each bubble
  for (const link of (graphData.links ?? [])) {
    const sBid = getBubbleIdForNode(link.source);
    const tBid = getBubbleIdForNode(link.target);
    if (sBid != null && sBid === tBid && bubbles.has(sBid)) {
      bubbles.get(sBid).unpoppedLinks.add(link);
    }
  }

  return bubbles;
}

/** Provide the expanded (popped) contents for a bubble */
export function setPoppedContents(bubbleId, { nodes = [], links = [], nestedBubbleIds = [] } = {}) {
  const rec = bubbles.get(bubbleId);
  if (!rec) return;
  rec.poppedNodes = new Set(nodes);
  rec.poppedLinks = new Set(links);
  rec.poppedBubbles = new Set(nestedBubbleIds);
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
