import eventBus from "../../input/event-bus.js";

export default function delLinkForce(forceGraph) {
  let strength = -4000;    // Repulsion strength
  let maxDegree = 4;       // Max degrees of separation
  let deletionCache = [];  

  function force(alpha) {
    for (const { link, nodes } of deletionCache) {
      const x1 = link.source.x, y1 = link.source.y;
      const x2 = link.target.x, y2 = link.target.y;
      const dx = x2 - x1, dy = y2 - y1;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen === 0) continue;

      const ux = dx / segLen, uy = dy / segLen;

      for (const node of nodes) {

        if (!node || typeof node !== 'object' || !('vx' in node)) continue;
        const nodeX = node.x, nodeY = node.y;

        const proj = (nodeX - x1) * ux + (nodeY - y1) * uy;
        const cx = x1 + proj * ux;
        const cy = y1 + proj * uy;

        const rx = nodeX - cx;
        const ry = nodeY - cy;
        const dist = Math.sqrt(rx * rx + ry * ry);
        if (dist === 0) continue;

        const f = strength / (dist * dist);

        if (!node || typeof node !== 'object' || !('vx' in node)) continue;
        node.vx += (rx / dist) * f * alpha;
        node.vy += (ry / dist) * f * alpha;
      }
    }
  }

  function getNeighbors(node) {
    const neighbors = [];
    for (const l of forceGraph.graphData().links) {
      if (l.source === node) neighbors.push(l.target);
      else if (l.target === node) neighbors.push(l.source);
    }
    return neighbors;
  }

  function bfsNodesWithinDegrees(a, b, degree) {
    const visited = new Set([a, b]);
    const queue = [{ node: a, depth: 0 }, { node: b, depth: 0 }];
    const result = [];

    while (queue.length > 0) {
      const { node, depth } = queue.shift();
      if (node !== a && node !== b) result.push(node);
      if (depth >= degree) continue;

      for (const neighbor of getNeighbors(node)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, depth: depth + 1 });
        }
      }
    }
    return result;
  }

  function rebuildCache() {
    const allLinks = forceGraph.graphData().links;
    const deletionLinks = allLinks.filter(l => l.isDel);

    deletionCache = [];
    for (const link of deletionLinks) {
      const nodesNear = bfsNodesWithinDegrees(link.source, link.target, maxDegree);
      if (nodesNear.length) {
        deletionCache.push({ link, nodes: nodesNear });
      }
    }
  }

  function initialize() {
    rebuildCache();

    eventBus.subscribe("graph-updated", (changed) => {
      if (changed) {
        rebuildCache();
      }
    });
  }

  // --- D3-style API methods ---
  force.initialize = function(_nodes, ...args) {
    initialize();
  };

  force.strength = function(_) {
    return arguments.length ? (strength = +_, force) : strength;
  };

  force.maxDegree = function(_) {
    return arguments.length ? (maxDegree = +_, rebuildCache(), force) : maxDegree;
  };

  return force;
}
