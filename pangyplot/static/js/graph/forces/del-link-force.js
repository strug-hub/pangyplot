export default function delLinkForce() {
  let strength = -4000;    // Repulsion strength
  let distanceMax = 400;   // Maximum distance for repulsion
  let maxDegree = 4;       // Max degrees of separation
  let links = [];
  let nodes = [];
  let adjacencyList = new Map();

  function force(alpha) {
    for (const link of links) {
      if (!link.is_del) continue;

      const x1 = link.source.x, y1 = link.source.y;
      const x2 = link.target.x, y2 = link.target.y;

      // Find nodes near this deleted link
      const nearbyNodes = [
        ...getNodesWithinDegrees(link.source, maxDegree),
        ...getNodesWithinDegrees(link.target, maxDegree)
      ];

      for (const node of nearbyNodes) {
        if (!node || node === link.source || node === link.target) continue;

        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const unitDx = dx / len, unitDy = dy / len;
        const projection = ((node.x - x1) * unitDx + (node.y - y1) * unitDy);
        const closestX = x1 + projection * unitDx;
        const closestY = y1 + projection * unitDy;
        const dist = Math.sqrt((node.x - closestX) ** 2 + (node.y - closestY) ** 2);

        if (dist <= distanceMax) {
          const f = strength / (dist * dist);
          const repelX = (node.x - closestX) / dist;
          const repelY = (node.y - closestY) / dist;

          node.vx += repelX * f * alpha;
          node.vy += repelY * f * alpha;
        }
      }
    }
  }

  function initialize() {
    adjacencyList = new Map();
    for (const link of links) {
      if (!adjacencyList.has(link.source)) adjacencyList.set(link.source, []);
      if (!adjacencyList.has(link.target)) adjacencyList.set(link.target, []);
      adjacencyList.get(link.source).push(link.target);
      adjacencyList.get(link.target).push(link.source);
    }
  }

  function getNodesWithinDegrees(startNode, degree) {
    const visited = new Set();
    const queue = [{ node: startNode, depth: 0 }];
    const result = [];

    while (queue.length > 0) {
      const { node, depth } = queue.shift();
      if (depth > degree || visited.has(node)) continue;
      visited.add(node);
      result.push(node);

      for (const neighbor of adjacencyList.get(node) || []) {
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }
    return result;
  }

  // --- D3-style API methods ---
  force.initialize = function(_nodes, ...args) {
    nodes = _nodes;
    initialize();
  };

  force.links = function(_) {
    return arguments.length ? (links = _, initialize(), force) : links;
  };

  force.strength = function(_) {
    return arguments.length ? (strength = +_, force) : strength;
  };

  force.distanceMax = function(_) {
    return arguments.length ? (distanceMax = +_, force) : distanceMax;
  };

  force.maxDegree = function(_) {
    return arguments.length ? (maxDegree = +_, force) : maxDegree;
  };

  return force;
}
