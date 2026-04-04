// Segment Registry: maps GFA segment IDs to SimObjects.
//
// Stores only ENDS — the exposed boundary of each SimObject.
// When a link needs to resolve, the registry returns the SimObject,
// which is then asked resolveEnd(link) to get the correct d3 node
// (strand-aware for kinked segments).

// segId (s-prefixed) → SimObject
const registry = new Map();

function ensurePrefix(id) {
    const s = String(id);
    return s.startsWith('s') ? s : `s${s}`;
}

/**
 * Register a segment ID as an end of a SimObject.
 */
export function registerSeg(segId, obj) {
    registry.set(ensurePrefix(segId), obj);
}

/**
 * Register multiple segment IDs to the same SimObject.
 */
export function registerSegs(segIds, obj) {
    for (const segId of segIds) {
        registry.set(ensurePrefix(segId), obj);
    }
}

/**
 * Unregister a segment ID.
 */
export function unregisterSeg(segId) {
    registry.delete(ensurePrefix(segId));
}

/**
 * Look up which SimObject owns this segment as an end.
 * Returns the SimObject or null.
 */
export function resolveSeg(segId) {
    return registry.get(ensurePrefix(segId)) || null;
}

/**
 * Resolve a GFA link endpoint to a d3 force node.
 * Looks up the SimObject for the segId, then calls resolveEnd(link).
 */
export function resolveEndForLink(segId, link) {
    const obj = registry.get(ensurePrefix(segId));
    if (!obj) return null;
    if (typeof obj.resolveEnd === 'function') return obj.resolveEnd(link);
    // Legacy fallback: obj is a raw d3 node (from old polychain-adapter registrations)
    return obj.node ?? obj;
}

/**
 * Clear the entire registry.
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
