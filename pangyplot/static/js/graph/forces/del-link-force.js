import { getActiveDeletionLinks, getInsideNodeElements } from "../data/graph-manager.js";
import { computeNodeCentroid } from "../utils/node-utils.js";

export default function delLinkForce() {
  const cache = new Map();
  let strength = 2;

  function force(alpha) {
    for (const { link, nodes } of cache.values()) {
      if (!nodes.length) continue;

      const { nx, ny } = linkUnitNormal(link);
      const c = computeNodeCentroid(nodes);
      const dist = signedDistanceToLine(c, link);
      const sideSign = dist >= 0 ? +1 : -1;

      for (const node of nodes) {
        if (!node || typeof node !== "object" || !("vx" in node)) continue;
        const f = strength * sideSign * alpha;
        node.vx += nx * f;
        node.vy += ny * f;
      }
    }
  }

  // ---------- helpers ----------

  function linkUnitNormal(link) {
    const dx = link.target.x - link.source.x;
    const dy = link.target.y - link.source.y;
    const len = Math.hypot(dx, dy) || 1;
    return { nx: dy / len, ny: -dx / len };
  }

  function signedDistanceToLine(point, link) {
    const x1 = link.source.x, y1 = link.source.y;
    const x2 = link.target.x, y2 = link.target.y;
    const A = y2 - y1, B = -(x2 - x1), C = (x2 * y1 - y2 * x1);
    return (A * point.x + B * point.y + C) / Math.hypot(A, B);
  }

  function rebuildCache() {
    cache.clear();
    const delLinks = getActiveDeletionLinks();

    for (const link of delLinks) {
      if (!link.bubbleId) continue;
      const bubbleId = link.bubbleId;

      const insideNodes = getInsideNodeElements(bubbleId)
        .filter(node => {
          // Remove end nodes
          if (node.type !== "bubble:end") return true;
          const stripped = bubbleId.slice(1); // remove initial "b"
          return !(node.id === `b>${stripped}` || node.id === `b<${stripped}`);
        });

      if (!insideNodes.length) continue;
      const record = {link: link, nodes: insideNodes };
      cache.set(bubbleId, record);
    }
  }

   // D3 force API
  force.initialize = function init() {
    rebuildCache(); //called whenever forcegraph changes
  };

  force.strength = function(_) {
    if (!arguments.length) return strength;
    strength = +_;
    return force;
  };

  force.rebuild = () => rebuildCache();

  return force;
}