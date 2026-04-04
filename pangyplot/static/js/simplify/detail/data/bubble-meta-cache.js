// Bubble metadata cache: batch-fetches per-chain bubble metadata from /bubble-meta.
// Stores raw metadata only — positions, colors, thresholds computed at render time.

import { scheduleFrame } from '../../utils/frame-scheduler.js';

// chainId → { bubbles: [{id, t, length, size, gc_count, is_ref, bp_start, bp_end, subtype, ...}] }
const stores = new Map();

// Batch fetch queue
const batchQueue = new Set();
const pending = new Set();
let batchTimer = null;

// Per-bubble visibility threshold
const _LOG50 = Math.log10(50);
const _RANGE_INV = 1 / (Math.log10(100050) - _LOG50);
function computeGridThreshold(bpLength) {
    if (bpLength <= 0) return 20;
    const x = Math.log10(bpLength + 50) - _LOG50;
    return Math.min(400, 20 + x * _RANGE_INV * 380);
}

/** Exposed for callers that need the threshold outside the store. */
export function bubbleGridThreshold(bpLength) {
    return computeGridThreshold(bpLength);
}

// ---------------------------------------------------------------
// Batch fetch
// ---------------------------------------------------------------

export function fetchBubbleMeta(chainId, chromosome) {
    if (stores.has(chainId) || batchQueue.has(chainId) || pending.has(chainId)) return;
    batchQueue.add(chainId);

    if (!batchTimer) {
        batchTimer = Promise.resolve().then(() => {
            batchTimer = null;
            flushBatch(chromosome);
        });
    }
}

async function flushBatch(chromosome) {
    if (batchQueue.size === 0) return;

    const chainIds = [...batchQueue];
    batchQueue.clear();
    for (const cid of chainIds) pending.add(cid);

    try {
        const resp = await fetch('/bubble-meta-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chain_ids: chainIds, chromosome }),
        });
        if (!resp.ok) return;
        const result = await resp.json();

        for (const [cid, bubbles] of Object.entries(result)) {
            if (!bubbles || bubbles.length === 0) {
                stores.set(cid, { bubbles: [] });
                continue;
            }
            stores.set(cid, { bubbles });
        }
        scheduleFrame();
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.warn('[bubble-meta] batch fetch failed:', e);
        }
    } finally {
        for (const cid of chainIds) pending.delete(cid);
    }
}

// ---------------------------------------------------------------
// Store access
// ---------------------------------------------------------------

/** Return the bubble store entry for a chain, or null. */
export function getBubbleStore(chainId) {
    return stores.get(chainId) || null;
}

/** Check if bubble data exists (or is empty) for a chain. */
export function hasBubbleMeta(chainId) {
    return stores.has(chainId);
}

// ---------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------

/** Clear all cached data (e.g. on chromosome change). */
export function clearBubbleMetaCache() {
    stores.clear();
    batchQueue.clear();
    pending.clear();
    batchTimer = null;
}
