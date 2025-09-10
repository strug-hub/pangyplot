import eventBus from '../../../../utils/event-bus.js';
import NodeSet from '../../../utils/node-set.js';
import { influence } from './drag-influence-engine.js';

const MAX_DRAG_DEPTH = 200;

const cache = new NodeSet("drag-force");
var cacheValid = false;
var previousPos = { x: null, y: null };

function influenceDecay() {
  return 0.1 - 0.09 * influence;
}

function buildDragCache(forceGraph) {
  cache.clear();
  const draggedNode = forceGraph.draggedNode;
  if (!draggedNode) return;

  const queue = [{ node: draggedNode, depth: 0 }];
  const visited = new Set([draggedNode]);

  const links = forceGraph.graphData().links;

  while (queue.length > 0) {
    const { node, depth } = queue.shift();
    if (!forceGraph.selected.has(node)) {
      if (node.fx !== undefined) continue;

      cache.add(node, depth);
    }

    if (depth >= MAX_DRAG_DEPTH) continue;

    for (const link of links) {
      const neighbor =
        link.source === node ? link.target :
          link.target === node ? link.source : null;

      if (neighbor && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }
  }

  // Add selected nodes as depth=0
  for (const node of forceGraph.selected) {
    cache.add(node, 0);
  }

  cacheValid = true;
}

export default function dragInfluenceForce(forceGraph) {

  eventBus.subscribe('graph:selection-changed', () => {
    cacheValid = false;
  });

  return function force(alpha) {

    if (!forceGraph.isDragging()) {
      previousPos = { x: null, y: null };
      return;
    }

    if (!cacheValid) buildDragCache(forceGraph);

    const draggedNode = forceGraph.draggedNode;

    const { x: prevX, y: prevY } = previousPos;
    previousPos = { x: draggedNode.x, y: draggedNode.y };

    if (prevX === null || prevY === null) return;

    const dx = draggedNode.x - prevX;
    const dy = draggedNode.y - prevY;

    const INFLUENCE_DECAY = influenceDecay();

    for (const [node, depth] of cache.nodeValuePairs()) {
      if (node === draggedNode) continue;

      const dampen = depth === 0
        ? 1
        : Math.max(0, 1 - INFLUENCE_DECAY * depth);

      node.x += dx * dampen;
      node.y += dy * dampen;

      if (forceGraph.selected.has(node)) {
        if (node.fx !== undefined) {
          node.fx += dx;
        }
        if (node.fy !== undefined) {
          node.fy += dy;
        }
      }
    }
  };
}
