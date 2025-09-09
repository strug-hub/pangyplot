import { buildUrl, fetchData } from '../../../utils/network-utils.js';
import { processBubbleContents } from './bubble-pop-data.js';
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

      try {
        const params = { id: bubble.id, ...forceGraph.coords };
        const url = buildUrl('/pop', params);
        const data = await fetchData(url, 'subgraph');
        await processBubbleContents(forceGraph, bubble.id, data);
      } catch (err) {
        console.warn('[bubble-pop] failed', bubble.id, err);
      }
    }
  } finally {
    fetching = false;
  }
}
