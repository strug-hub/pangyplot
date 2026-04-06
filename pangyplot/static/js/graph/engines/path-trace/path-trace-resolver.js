// Resolves path segments to SimObjects and builds render data.

import * as registry from '../../detail/model/segment-registry.js';
import { getAllContainers, getObject } from '../../detail/model/model-manager.js';

// ---------------------------------------------------------------
// Bubble-to-chain index
// ---------------------------------------------------------------

let _bubbleToChain = null;
let _indexVersion = 0;

/**
 * Rebuild the bubble-to-chain index from all active containers.
 * Call when detailData changes or after pop/unpop.
 */
export function rebuildBubbleToChainIndex() {
    _bubbleToChain = new Map();
    _indexVersion++;
    for (const [chainId, container] of getAllContainers()) {
        for (const b of container.bubbles) {
            _bubbleToChain.set(String(b.id), { chainId, t: b.t, container });
        }
    }
}

export function getBubbleToChainIndex() {
    if (!_bubbleToChain) rebuildBubbleToChainIndex();
    return _bubbleToChain;
}

// ---------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------

/**
 * Parse a segment string like "s101+" into { segId: "s101", direction: "+" }.
 */
function parseSegment(segStr) {
    const direction = segStr.slice(-1);
    let segId = segStr.slice(0, -1);
    if (!segId.startsWith('s')) segId = 's' + segId;
    return { segId, direction };
}

/**
 * @typedef {object} ResolvedStep
 * @property {string} rawSegment — e.g. "s101+"
 * @property {string} segId — e.g. "s101"
 * @property {string} direction — "+" or "-"
 * @property {string[]} bubbleHierarchy — e.g. ["b1", "b5"]
 * @property {object|null} simObject — resolved SimObject
 * @property {"direct"|"bubble"|"chain"|"unresolved"} resolveType
 * @property {string|null} chainId
 * @property {number|null} tPosition — t on chain spine
 */

/**
 * Resolve a single path step to a SimObject.
 *
 * @param {string} segStr — segment with direction, e.g. "s101+"
 * @param {string[]} bubbles — bubble hierarchy, innermost first
 * @returns {ResolvedStep}
 */
function resolveStep(segStr, bubbles) {
    const { segId, direction } = parseSegment(segStr);
    const base = { rawSegment: segStr, segId, direction, bubbleHierarchy: bubbles };

    // Case A: segment directly registered (popped, or a chain end)
    const obj = registry.resolve(segId);
    if (obj) {
        return { ...base, simObject: obj, resolveType: 'direct', chainId: null, tPosition: null };
    }

    // Case B: walk bubble hierarchy
    const btc = getBubbleToChainIndex();
    for (const bId of bubbles) {
        // Check if this bubble is a live BubbleObject in the force graph
        const bubbleObj = getObject(bId);
        if (bubbleObj && bubbleObj.constructor.name !== 'PolychainSegment') {
            return { ...base, simObject: bubbleObj, resolveType: 'bubble', chainId: null, tPosition: null };
        }

        // Check if this bubble is on a chain (collapsed)
        const entry = btc.get(String(bId));
        if (entry) {
            // Find which PolychainSegment covers this t
            const seg = _findSegmentAtT(entry.container, entry.t);
            return {
                ...base,
                simObject: seg,
                resolveType: 'chain',
                chainId: entry.chainId,
                tPosition: entry.t,
            };
        }
    }

    // Unresolved — segment is outside loaded detail data
    return { ...base, simObject: null, resolveType: 'unresolved', chainId: null, tPosition: null };
}

/**
 * Find which PolychainSegment in a container covers a given t-position.
 */
function _findSegmentAtT(container, t) {
    for (const seg of container.segments) {
        if (t >= seg.tRange.start && t <= seg.tRange.end) return seg;
    }
    // Fallback: nearest segment
    let best = null, bestDist = Infinity;
    for (const seg of container.segments) {
        const mid = (seg.tRange.start + seg.tRange.end) / 2;
        const d = Math.abs(mid - t);
        if (d < bestDist) { bestDist = d; best = seg; }
    }
    return best;
}

// ---------------------------------------------------------------
// Full path resolution
// ---------------------------------------------------------------

/**
 * Resolve an entire bubble_path array from the /path API.
 *
 * @param {Array} bubblePath — [["s101+", ["b1", "b5"]], ...]
 * @returns {ResolvedStep[]}
 */
export function resolvePath(bubblePath) {
    if (!bubblePath || bubblePath.length === 0) return [];
    return bubblePath.map(([segStr, bubbles]) => resolveStep(segStr, bubbles || []));
}

// ---------------------------------------------------------------
// Build render data from resolved path
// ---------------------------------------------------------------

/**
 * Build render data structures from a resolved path.
 *
 * @param {ResolvedStep[]} resolved
 * @returns {object} renderData
 */
export function buildRenderData(resolved) {
    const chainOverlays = new Map(); // chainId → { tRanges: [{start, end}] }
    const kinkHighlights = new Set();
    const bubbleHighlights = new Set();

    for (const step of resolved) {
        if (!step.simObject) continue;

        switch (step.resolveType) {
            case 'direct':
                kinkHighlights.add(step.simObject);
                break;
            case 'bubble':
                bubbleHighlights.add(step.simObject);
                break;
            case 'chain': {
                if (!step.chainId || step.tPosition == null) break;
                if (!chainOverlays.has(step.chainId)) {
                    chainOverlays.set(step.chainId, { tRanges: [] });
                }
                chainOverlays.get(step.chainId).tRanges.push({
                    start: step.tPosition,
                    end: step.tPosition,
                });
                break;
            }
        }
    }

    // Merge adjacent t-ranges per chain into contiguous spans
    for (const [, overlay] of chainOverlays) {
        overlay.tRanges = _mergeTRanges(overlay.tRanges);
    }

    return { chainOverlays, kinkHighlights, bubbleHighlights };
}

/**
 * Sort and merge t-ranges that are close together.
 * Uses a small epsilon to connect nearly-adjacent bubbles into one polyline.
 */
function _mergeTRanges(ranges) {
    if (ranges.length <= 1) return ranges;
    ranges.sort((a, b) => a.start - b.start);

    const merged = [{ ...ranges[0] }];
    const EPS = 0.01; // merge ranges within 1% of chain length
    for (let i = 1; i < ranges.length; i++) {
        const prev = merged[merged.length - 1];
        if (ranges[i].start - prev.end <= EPS) {
            prev.end = Math.max(prev.end, ranges[i].end);
        } else {
            merged.push({ ...ranges[i] });
        }
    }
    return merged;
}
