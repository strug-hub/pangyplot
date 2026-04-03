// Segment Registry: unified map from GFA segment IDs to their current
// visual representation in the force sim.
//
// Every GFA segment is represented by exactly one force node at any time:
//   - Chain head/tail polychain node (when not popped)
//   - Anchor node (when neighbor bubble is popped)
//   - Actual segment kink node (when the segment itself is popped/revealed)
//   - Junction force node
//
// All links are GFA seg→seg connections. Resolution through this registry
// determines which force nodes they connect.

// segId (string, no prefix) → { node, kinkIdx }
// kinkIdx: which kink of the node to connect to (for strand resolution)
const registry = new Map();

/**
 * Register a segment ID as represented by a given force node.
 * Later registrations override earlier ones (more detailed wins).
 */
export function registerSeg(segId, node, kinkIdx = 0) {
    registry.set(String(segId), { node, kinkIdx });
}

/**
 * Register multiple segment IDs to the same node.
 */
export function registerSegs(segIds, node, kinkIdx = 0) {
    for (const segId of segIds) {
        registry.set(String(segId), { node, kinkIdx });
    }
}

/**
 * Unregister a segment ID.
 */
export function unregisterSeg(segId) {
    registry.delete(String(segId));
}

/**
 * Look up the current visual node for a segment ID.
 * Returns { node, kinkIdx } or null.
 */
export function resolveSeg(segId) {
    return registry.get(String(segId)) || null;
}

/**
 * Resolve a GFA link's source and target through the registry.
 * Sets link.source and link.target to the current visual nodes.
 * Returns true if both endpoints resolved, false if either is missing.
 */
export function resolveLink(link) {
    const src = registry.get(String(link.sourceSeg));
    const tgt = registry.get(String(link.targetSeg));
    if (!src || !tgt) return false;
    // For multi-kink segments, pick the correct kink node
    // (stored kinkIdx from registration, or find by iid)
    link.source = src.node;
    link.target = tgt.node;
    return true;
}

/**
 * Re-resolve all links in a list. Removes links where either endpoint
 * can't be resolved (the segment isn't currently represented).
 */
export function resolveAllLinks(links) {
    for (let i = links.length - 1; i >= 0; i--) {
        if (links[i].sourceSeg == null || links[i].targetSeg == null) continue;
        if (!resolveLink(links[i])) {
            links.splice(i, 1);
        }
    }
}

/**
 * Clear the entire registry (e.g., on viewport change).
 */
export function clearRegistry() {
    registry.clear();
}

/**
 * Get the registry size (for debugging).
 */
export function registrySize() {
    return registry.size;
}

// Debug access
window.__segRegistry = registry;
