import eventBus from '../../../utils/event-bus.js';
import recordsManager from '../../data/records/records-manager.js';
import forceGraph from '../../force-graph.js';

let queue = [];
let enqueued = new Set();
let fetching = false;

export function popBubble(bubble) {
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

export function popBubbles(bubbles) {
  bubbles.forEach(bubble => popBubble(bubble));
}

async function drain() {
  try {
    while (queue.length) {
      const bubble = queue.shift();
      enqueued.delete(bubble.id);

      recordsManager.getBubbleSubgraph(bubble.id);

      try {

        const graphBubbleRecords = await recordsManager.getBubbleSubgraph(bubble.id, forceGraph.coords);
        
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

        forceGraph.setSelected(nodes);
        forceGraph.setHighlighted(null);

        eventBus.publish('graph:bubble-popped', { id: bubble.id, graphData });

      } catch (err) {
        console.warn('[bubble-pop] failed:', bubble.id, err);
      }
    }
  } finally {
    fetching = false;
  }
}
