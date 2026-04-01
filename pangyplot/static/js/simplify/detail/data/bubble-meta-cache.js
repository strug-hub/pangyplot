// Central bubble store: batch-fetches per-chain bubble metadata,
// allocates position objects once, updates coordinates in-place each frame.
// Single source of truth for bubble circle rendering + hover hit-testing.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';

// chainId → store entry { bubbles, cumLen, totalLen, positions }
const stores = new Map();

// Batch fetch queue
const batchQueue = new Set();
const pending = new Set();  // chain IDs with in-flight requests
let batchTimer = null;

// Per-bubble visibility threshold (precomputed at fetch time)
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

/**
 * Queue a chain for bubble metadata fetch. Requests are batched —
 * multiple calls in the same frame collapse into one POST.
 */
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
                // Store empty entry so we don't re-fetch
                stores.set(cid, { bubbles: [], cumLen: null, totalLen: 0, positions: [] });
                continue;
            }

            // Precompute threshold + color input object per bubble
            for (const b of bubbles) {
                b.threshold = computeGridThreshold(b.length);
                b._colorObj = {
                    type: 'bubble',
                    size: b.size,
                    isRef: b.is_ref,
                    record: {
                        seqLength: b.length,
                        gcCount: b.gc_count,
                        start: b.bp_start,
                        end: b.bp_end,
                    },
                };
            }

            // Allocate position objects once — x/y updated in-place each frame
            const positions = bubbles.map(meta => ({ x: 0, y: 0, meta }));

            stores.set(cid, {
                bubbles,
                cumLen: null,   // allocated on first updateBubblePositions call
                totalLen: 0,
                positions,
            });
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

/** Return the positions array for hit-testing (same reference, no allocation). */
export function getBubblePositions(chainId) {
    const store = stores.get(chainId);
    return store ? store.positions : null;
}

// ---------------------------------------------------------------
// Per-frame position update (in-place, no allocation)
// ---------------------------------------------------------------

/**
 * Update bubble positions for a chain from its current polyline.
 * Recomputes cumulative arc lengths into a reused Float64Array,
 * then interpolates each bubble position in-place.
 */
export function updateBubblePositions(chainId, pl) {
    const store = stores.get(chainId);
    if (!store || store.positions.length === 0) return;

    const n = pl.length;

    // Allocate or resize cumLen typed array (rare — only on polyline length change)
    if (!store.cumLen || store.cumLen.length !== n) {
        store.cumLen = new Float64Array(n);
    }

    // Fill cumulative lengths in-place
    store.cumLen[0] = 0;
    for (let i = 1; i < n; i++) {
        const dx = pl[i][0] - pl[i - 1][0];
        const dy = pl[i][1] - pl[i - 1][1];
        store.cumLen[i] = store.cumLen[i - 1] + Math.hypot(dx, dy);
    }
    store.totalLen = store.cumLen[n - 1];
    if (store.totalLen === 0) return;

    // Interpolate each bubble position in-place (inlined from interpolateAtDist)
    const cumLen = store.cumLen;
    const totalLen = store.totalLen;
    for (const pos of store.positions) {
        const d = pos.meta.t * totalLen;
        if (d <= 0) {
            pos.x = pl[0][0];
            pos.y = pl[0][1];
        } else if (d >= totalLen) {
            pos.x = pl[n - 1][0];
            pos.y = pl[n - 1][1];
        } else {
            // Binary search for segment
            let lo = 0, hi = n - 1;
            while (lo < hi - 1) {
                const mid = (lo + hi) >> 1;
                if (cumLen[mid] <= d) lo = mid; else hi = mid;
            }
            const segLen = cumLen[hi] - cumLen[lo];
            const t = segLen > 0 ? (d - cumLen[lo]) / segLen : 0;
            pos.x = pl[lo][0] + t * (pl[hi][0] - pl[lo][0]);
            pos.y = pl[lo][1] + t * (pl[hi][1] - pl[lo][1]);
        }
    }
}

/**
 * Update bubble positions using visible segments (gap-aware).
 * Each segment has { polyline, tStart, tEnd } where tStart/tEnd are
 * arc-length fractions along the full chain.  Each bubble is placed
 * on the segment that contains its t value, positioned locally within
 * that segment.  Bubbles in gap regions are hidden (placed offscreen).
 */
export function updateBubblePositionsSegmented(chainId, segments) {
    const store = stores.get(chainId);
    if (!store || store.positions.length === 0 || !segments || segments.length === 0) return;

    // Precompute cumulative lengths for each segment
    const segData = segments.map(seg => {
        const pl = seg.polyline;
        const n = pl.length;
        const cumLen = new Float64Array(n);
        cumLen[0] = 0;
        for (let i = 1; i < n; i++) {
            cumLen[i] = cumLen[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
        }
        return { pl, cumLen, totalLen: cumLen[n - 1], tStart: seg.tStart, tEnd: seg.tEnd };
    });

    for (const pos of store.positions) {
        const bt = pos.meta.t;  // bubble's t along full chain

        // Find which visible segment contains this bubble
        let placed = false;
        for (const sd of segData) {
            if (bt < sd.tStart || bt > sd.tEnd) continue;
            if (sd.totalLen === 0) continue;

            // Remap t from [tStart, tEnd] to [0, 1] within this segment
            const localT = sd.tEnd > sd.tStart ? (bt - sd.tStart) / (sd.tEnd - sd.tStart) : 0.5;
            const d = localT * sd.totalLen;

            // Interpolate along segment polyline
            const { pl, cumLen } = sd;
            const n = pl.length;
            if (d <= 0) {
                pos.x = pl[0][0]; pos.y = pl[0][1];
            } else if (d >= sd.totalLen) {
                pos.x = pl[n - 1][0]; pos.y = pl[n - 1][1];
            } else {
                let lo = 0, hi = n - 1;
                while (lo < hi - 1) {
                    const mid = (lo + hi) >> 1;
                    if (cumLen[mid] <= d) lo = mid; else hi = mid;
                }
                const segLen = cumLen[hi] - cumLen[lo];
                const t = segLen > 0 ? (d - cumLen[lo]) / segLen : 0;
                pos.x = pl[lo][0] + t * (pl[hi][0] - pl[lo][0]);
                pos.y = pl[lo][1] + t * (pl[hi][1] - pl[lo][1]);
            }
            placed = true;
            break;
        }

        // Bubble falls in a gap — hide it offscreen
        if (!placed) {
            pos.x = -99999;
            pos.y = -99999;
        }
    }
}

/**
 * Split a parent chain's bubble store into two subchain stores.
 * Partitions bubbles by t < tSplit, remaps t values to local [0,1].
 * @returns {{ leftCount, rightCount }} for updating subchain nBubbles
 */
export function splitBubbleStore(parentId, leftId, rightId, tSplit) {
    const store = stores.get(parentId);
    if (!store) return { leftCount: 0, rightCount: 0 };

    const leftBubbles = [];
    const leftPositions = [];
    const rightBubbles = [];
    const rightPositions = [];

    for (let i = 0; i < store.bubbles.length; i++) {
        const b = store.bubbles[i];
        if (b.t < tSplit || (b.t === tSplit && tSplit > 0.5)) {
            const remapped = { ...b, t: tSplit > 0 ? b.t / tSplit : 0 };
            leftBubbles.push(remapped);
            leftPositions.push({ x: 0, y: 0, meta: remapped });
        } else {
            const remapped = { ...b, t: tSplit < 1 ? (b.t - tSplit) / (1 - tSplit) : 1 };
            rightBubbles.push(remapped);
            rightPositions.push({ x: 0, y: 0, meta: remapped });
        }
    }

    stores.set(leftId, { bubbles: leftBubbles, cumLen: null, totalLen: 0, positions: leftPositions });
    stores.set(rightId, { bubbles: rightBubbles, cumLen: null, totalLen: 0, positions: rightPositions });
    stores.delete(parentId);

    return { leftCount: leftBubbles.length, rightCount: rightBubbles.length };
}

/**
 * Reverse of splitBubbleStore: merge two subchain stores back into one parent store.
 */
export function mergeBubbleStores(leftId, rightId, parentId, tSplit) {
    const leftStore = stores.get(leftId);
    const rightStore = stores.get(rightId);
    const mergedBubbles = [];
    const mergedPositions = [];

    if (leftStore) {
        for (let i = 0; i < leftStore.bubbles.length; i++) {
            const b = leftStore.bubbles[i];
            const remapped = { ...b, t: b.t * tSplit };
            mergedBubbles.push(remapped);
            mergedPositions.push({ x: 0, y: 0, meta: remapped });
        }
    }
    if (rightStore) {
        for (let i = 0; i < rightStore.bubbles.length; i++) {
            const b = rightStore.bubbles[i];
            const remapped = { ...b, t: tSplit + b.t * (1 - tSplit) };
            mergedBubbles.push(remapped);
            mergedPositions.push({ x: 0, y: 0, meta: remapped });
        }
    }

    // Sort by t to maintain ordering
    const indices = mergedBubbles.map((_, i) => i).sort((a, b) => mergedBubbles[a].t - mergedBubbles[b].t);
    const sortedBubbles = indices.map(i => mergedBubbles[i]);
    const sortedPositions = indices.map(i => mergedPositions[i]);

    stores.set(parentId, { bubbles: sortedBubbles, cumLen: null, totalLen: 0, positions: sortedPositions });
    stores.delete(leftId);
    stores.delete(rightId);
}

// ---------------------------------------------------------------
// Pop / unpop helpers
// ---------------------------------------------------------------

/** Remove a bubble from a chain's store (after popping). Returns the removed meta or null. */
export function removeBubbleFromStore(chainId, bubbleId) {
    const store = stores.get(chainId);
    if (!store) return null;
    const idx = store.bubbles.findIndex(b => b.id === bubbleId);
    if (idx === -1) return null;
    const [meta] = store.bubbles.splice(idx, 1);
    store.positions.splice(idx, 1);
    return meta;
}

/** Restore a previously removed bubble into a chain's store (for undo). */
export function restoreBubbleToStore(chainId, meta) {
    const store = stores.get(chainId);
    if (!store || !meta) return;
    // Insert in sorted order by t
    let insertIdx = store.bubbles.findIndex(b => b.t > meta.t);
    if (insertIdx === -1) insertIdx = store.bubbles.length;
    store.bubbles.splice(insertIdx, 0, meta);
    store.positions.splice(insertIdx, 0, { x: 0, y: 0, meta });
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
