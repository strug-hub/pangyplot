import eventBus from '../../../utils/event-bus.js';
import { dragState } from './drag-state.js';
import { getSelectedNodeSet } from '../selection/selection-state.js';

function buildDragCache(forceGraph, draggedNode) {
    const links = forceGraph.graphData().links;

    const visited = new Set();
    const cache = [];

    const queue = [{ node: draggedNode, depth: 0 }];
    visited.add(draggedNode);

    const maxDepth = 200;

    const selectedNodeSet = new getSelectedNodeSet();

    while (queue.length > 0) {
        const { node, depth } = queue.shift();
        if (!selectedNodeSet.has(node)) {
            cache.push({ node, depth });
        }

        if (depth >= maxDepth) continue;

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

    // Add selected nodes as depth 0
    for (const node of getSelectedNodeSet()) {
      //todo: cache to node set
      cache.push({ node, depth: 0 });
    }

    return cache;
}

export default function dragInfluenceForce(forceGraph) {

    eventBus.subscribe('selection:changed', () => {
      dragState.cache = null;
    });

  return function force(alpha) {

    const selectedNodeSet = new getSelectedNodeSet();

    if (!dragState.draggedNode) return;

    if (!dragState.cache) {
      dragState.cache = buildDragCache(forceGraph, dragState.draggedNode);
    }

    const { x: prevX, y: prevY } = dragState.previousPos;
    dragState.previousPos = { x: dragState.draggedNode.x, y: dragState.draggedNode.y };
    
    if (prevX === null || prevY === null) return;

    const dx = dragState.draggedNode.x - prevX;
    const dy = dragState.draggedNode.y - prevY;

    for (const { node, depth } of dragState.cache) {
      if (node === dragState.draggedNode) continue;

      const dampen = depth === 0
        ? 1
        : Math.max(0, 1 - dragState.decay * depth);

      node.x += dx * dampen;
      node.y += dy * dampen;

      if (selectedNodeSet.has(node) && node.isFixed) {
        node.fx += dx;
        node.fy += dy;
      }
    }
  };
}
