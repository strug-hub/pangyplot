import eventBus from '../../../utils/event-bus.js';
import recordsManager from '../../data/records/records-manager.js';
import appState from '../../app-state.js';

let queue = [];
let enqueued = new Set();
let fetching = false;

export function popBubble(bubble, forceGraph) {
  if (bubble.type !== 'bubble') return false;
  const id = bubble.id;
  if (enqueued.has(id)) return false;

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

        const graphBubbleRecords = await recordsManager.getBubbleSubgraph(bubble.id, appState.coords);

        if (!graphBubbleRecords)
          throw new Error("No data returned");

        const nodes = [...graphBubbleRecords.bubble.nodes].map(r => r.elements.nodes).flat();
        const links = [...graphBubbleRecords.bubble.nodes, //nodeLinks in NodeRecords
                       ...graphBubbleRecords.bubble.links,
                       ...graphBubbleRecords.source.links,
                       ...graphBubbleRecords.sink.links].map(r => r.elements.links).flat();
        const graphData = { nodes, links };

        console.log("[bubble-pop] deserialized ", graphData);

        forceGraph.removeNodeById(bubble.id);
        forceGraph.addGraphData(graphData);

        appState.setSelected(nodes);
        appState.setHighlighted(null);

        eventBus.publish('graph:bubble-popped', { id: bubble.id, graphData });

      } catch (err) {
        console.warn('[bubble-pop] failed:', bubble.id, err);
      }
    }
  } finally {
    fetching = false;
  }
}
