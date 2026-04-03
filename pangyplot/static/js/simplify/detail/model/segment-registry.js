/**
 * SegmentRegistry — unified lookup from GFA segment ID to SimObject.
 *
 * Tracks ENDS ONLY. If a segment is in the registry, it's an exposed
 * boundary that GFA links can attach to. If it's not in the registry,
 * it's hidden inside some SimObject and the link system doesn't care.
 *
 * Replaces: seg-registry, viewState.segmentToNode, segToPolychain.
 */

const _map = new Map();

function _normalize(segId) {
    const s = String(segId);
    return s.startsWith('s') ? s : `s${s}`;
}

/**
 * Register a segment as an exposed end of a SimObject.
 * Later registrations override earlier ones (last-write-wins).
 * @param {string} segId
 * @param {SimObject} object
 */
export function register(segId, object) {
    _map.set(_normalize(segId), object);
}

/**
 * Register multiple segments to the same SimObject.
 * @param {string[]} segIds
 * @param {SimObject} object
 */
export function registerAll(segIds, object) {
    for (const id of segIds) _map.set(_normalize(id), object);
}

/**
 * Remove a segment from the registry.
 * @param {string} segId
 */
export function unregister(segId) {
    _map.delete(_normalize(segId));
}

/**
 * Remove multiple segments from the registry.
 * @param {string[]} segIds
 */
export function unregisterAll(segIds) {
    for (const id of segIds) _map.delete(_normalize(id));
}

/**
 * Look up which SimObject owns this segment as an end.
 * @param {string} segId
 * @returns {SimObject|null}
 */
export function resolve(segId) {
    return _map.get(_normalize(segId)) ?? null;
}

/**
 * Resolve a GFA link endpoint to a d3 force node.
 * Shorthand for: resolve(segId).resolveEnd(link)
 * @param {object} link — the full GFA link object
 * @param {string} segId — which endpoint to resolve
 * @returns {object|null} — d3 force node or null
 */
export function resolveForLink(link, segId) {
    const obj = _map.get(_normalize(segId));
    if (!obj) return null;
    return obj.resolveEnd(link);
}

/**
 * Clear all registrations.
 */
export function clear() {
    _map.clear();
}

/**
 * Current number of registered segments.
 * @returns {number}
 */
export function size() {
    return _map.size;
}

/**
 * Iterate all entries (for debugging / migration).
 * @returns {IterableIterator<[string, SimObject]>}
 */
export function entries() {
    return _map.entries();
}
