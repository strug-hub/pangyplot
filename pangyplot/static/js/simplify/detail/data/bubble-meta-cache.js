// Bubble metadata cache: fetches per-chain bubble data from /bubble-meta,
// caches by chain ID, deduplicates in-flight requests.
// Data is the single source of truth for bubble circle rendering + tooltip.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';

// chainId → Array<{ id, t, length, gc_count, size, subtype, bp_start, bp_end, is_ref }>
const cache = new Map();

// chainId → Promise (in-flight dedup)
const pending = new Map();

// chainId → Array<{ x, y, meta }> — computed positions from last render pass
const positionCache = new Map();

/**
 * Fetch bubble metadata for a chain. Non-blocking — caches result,
 * triggers redraw on completion. No-op if already cached or in-flight.
 */
export function fetchBubbleMeta(chainId, chromosome) {
    if (cache.has(chainId) || pending.has(chainId)) return;

    const url = `/bubble-meta?chain_id=${encodeURIComponent(chainId)}`
        + `&chromosome=${encodeURIComponent(chromosome)}`;

    const promise = fetch(url)
        .then(resp => {
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp.json();
        })
        .then(data => {
            cache.set(chainId, data.bubbles || []);
            pending.delete(chainId);
            scheduleFrame();
        })
        .catch(e => {
            pending.delete(chainId);
            if (e.name !== 'AbortError') {
                console.warn(`bubble-meta fetch failed for ${chainId}:`, e);
            }
        });

    pending.set(chainId, promise);
}

/** Return cached bubble array for a chain, or null if not yet loaded. */
export function getBubbleMeta(chainId) {
    return cache.get(chainId) || null;
}

/** Check if bubble metadata is cached for a chain. */
export function hasBubbleMeta(chainId) {
    return cache.has(chainId);
}

/**
 * Store computed bubble positions for a chain (called during rendering).
 * @param {string} chainId
 * @param {Array<{x: number, y: number, meta: object}>} positions
 */
export function setBubblePositions(chainId, positions) {
    positionCache.set(chainId, positions);
}

/** Get precomputed bubble positions for a chain (for hit-testing). */
export function getBubblePositions(chainId) {
    return positionCache.get(chainId) || null;
}

/** Clear all cached data (e.g. on chromosome change). */
export function clearBubbleMetaCache() {
    cache.clear();
    pending.clear();
    positionCache.clear();
}
