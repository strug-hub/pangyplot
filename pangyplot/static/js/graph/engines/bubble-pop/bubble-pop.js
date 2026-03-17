import eventBus from '../../../utils/event-bus.js';
import recordsManager from '../../data/records/records-manager.js';
import appState from '../../app-state.js';
import viewState from '../../data/view-state.js';
import { recordPop, loadHistory } from '../../../utils/pop-history.js';

let queue = [];
let enqueued = new Set();
let fetching = false;

export function popBubble(bubble, forceGraph) {
  if (bubble.type !== 'bubble') return false;
  const id = bubble.id;
  if (enqueued.has(id)) return false;

  recordPop('pop', { id });
  enqueued.add(id);
  queue.push(bubble);

  if (!fetching) {
    fetching = true;
    void drain(forceGraph);
  }
  return true;
}

export function popBubbles(bubbles, forceGraph) {
  bubbles.forEach(bubble => popBubble(bubble, forceGraph));
}

async function drain(forceGraph) {
  try {
    while (queue.length) {
      const bubble = queue.shift();
      enqueued.delete(bubble.id);

      try {
        const result = await recordsManager.getBubbleSubgraph(bubble.id);

        if (!result)
          throw new Error("No data returned");

        const { nodeRecords, linkRecords } = result;

        // Exclude segment nodes still owned by an adjacent collapsed bubble
        // (e.g. a shared boundary segment whose sibling bubble is still collapsed).
        // Those segments are visually represented by the owning bubble record —
        // they must not appear as standalone orphan nodes in D3.
        const visibleNodeRecords = nodeRecords.filter(r => {
          if (r.type !== 'segment') return true;
          const segId = r.id.slice(1); // strip 's' prefix
          return viewState.resolve(segId) === null;
        });

        const { nodes, links } = recordsManager.extractElementsFromRecords({ nodes: visibleNodeRecords, links: linkRecords });

        forceGraph.removeNodeById(bubble.id);
        forceGraph.addGraphData({ nodes, links });

        appState.setSelected(nodes);
        appState.setHighlighted(null);

        eventBus.publish('graph:bubble-popped', { id: bubble.id, graphData: { nodes, links } });

      } catch (err) {
        console.warn('[bubble-pop] failed:', bubble.id, err);
      }
    }
  } finally {
    fetching = false;
  }
}

// ---------------------------------------------------------------
// Replay a saved pop history file (core viewer)
// ---------------------------------------------------------------
export async function replayHistory(forceGraph) {
  const ops = await loadHistory('core');
  if (!ops || ops.length === 0) {
    console.warn('No pop history to replay');
    return;
  }

  const selectOp = ops.find(o => o.action === 'select');
  if (!selectOp) {
    console.warn('Pop history has no select entry, cannot navigate');
    return;
  }

  const { genome, chromosome, start, end } = selectOp;
  console.log(`Replaying: loading ${chromosome}:${start}-${end}`);

  // Wait for data to load after publishing construct-graph
  const dataLoaded = new Promise(resolve => {
    const unsub = eventBus.subscribe('graph:data-replaced', () => {
      unsub();
      resolve(true);
    });
    setTimeout(() => { unsub(); resolve(false); }, 10000);
  });

  eventBus.publish('ui:construct-graph', {
    genome,
    chromosome,
    start: Number(start),
    end: Number(end),
  });

  const loaded = await dataLoaded;
  if (!loaded) {
    console.warn('Timed out waiting for graph data');
    return;
  }

  // Replay bubble pops sequentially — each pop may reveal child bubbles
  const popOps = ops.filter(o => o.action === 'pop');
  let popCount = 0;
  for (const op of popOps) {
    const node = forceGraph.graphData().nodes.find(n => n.id === op.id);
    if (!node) {
      console.warn(`Replay: node ${op.id} not found, skipping`);
      continue;
    }

    // Wait for this specific pop to complete
    const popped = new Promise(resolve => {
      const unsub = eventBus.subscribe('graph:bubble-popped', evt => {
        if (evt.id === op.id) {
          unsub();
          resolve(true);
        }
      });
      setTimeout(() => { unsub(); resolve(false); }, 10000);
    });

    popBubble(node, forceGraph);
    const ok = await popped;
    if (ok) {
      popCount++;
    } else {
      console.warn(`Replay: pop ${op.id} timed out`);
    }
  }

  console.log(`Replayed ${popCount} bubble-pops`);
}
