import eventBus from '../../../input/event-bus.js';
import { dragState } from './drag-state.js';

function buildDragCache(forceGraph, draggedNode) {
    const nodes = forceGraph.graphData().nodes;
    const links = forceGraph.graphData().links;

    const visited = new Set();
    const cache = [];

    const queue = [{ node: draggedNode, depth: 0 }];
    visited.add(draggedNode);

    const maxDepth = 200;

    while (queue.length > 0) {
        const { node, depth } = queue.shift();
        if (!node.isSelected) {
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
    for (const node of nodes) {
        if (node.isSelected) {
            cache.push({ node, depth: 0 });
        }
    }

    return cache;
}

export default function dragInfluenceForce(forceGraph) {

    eventBus.subscribe('selection:changed', () => {
      dragState.cache = null;
    });

  return function force(alpha) {
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

      const strength = depth === 0
        ? 1
        : Math.max(0, 1 - dragState.decay * depth);
      
      node.x += dx * strength;
      node.y += dy * strength;

      if (node.isSelected && node.isFixed) {
        node.fx += dx;
        node.fy += dy;
      }
    }
  };
}
