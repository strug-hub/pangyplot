/**
 * Boundary-based path resolver.
 *
 * Resolves decoded path steps to render data by matching against registered
 * boundary segments (chain entries/exits, junction nodes). No server-side
 * bubble annotation needed — chains are identified by their headSegs/tailSegs.
 *
 * State machine:
 *   idle → hit chain entry → inChain → hit chain exit → emit chain overlay → idle
 *   idle → hit junction segment → emit as kink highlight → idle
 */

import * as registry from '../../detail/model/segment-registry.js';
import { getAllContainers, getObject } from '../../detail/model/model-manager.js';

// -------------------------------------------------------------------
// Boundary index
// -------------------------------------------------------------------

/**
 * @typedef {object} BoundaryInfo
 * @property {string} chainId
 * @property {'entry'|'exit'} role
 * @property {object} container — PolychainContainer
 * @property {object} segment — PolychainSegment that owns this boundary
 */

/**
 * Build an index mapping segment IDs to their boundary role.
 *
 * For each container, headSegs are entries and tailSegs are exits.
 * When bubbles are popped, the split segments also register their
 * boundaries, giving finer-grained entry/exit points within the chain.
 *
 * @returns {Map<string, BoundaryInfo>}
 */
export function buildBoundaryIndex() {
    const index = new Map();

    for (const [chainId, container] of getAllContainers()) {
        for (const seg of container.segments) {
            // Head segments = entry into this segment's t-range
            for (const segId of seg.ends.head) {
                index.set(String(segId), {
                    chainId,
                    role: 'entry',
                    container,
                    segment: seg,
                });
            }
            // Tail segments = exit from this segment's t-range
            for (const segId of seg.ends.tail) {
                index.set(String(segId), {
                    chainId,
                    role: 'exit',
                    container,
                    segment: seg,
                });
            }
        }
    }

    return index;
}

// -------------------------------------------------------------------
// Path resolution
// -------------------------------------------------------------------

/**
 * Resolve a decoded path against the boundary index.
 *
 * @param {Array<{segId: number, direction: string}>} steps
 * @param {Map<string, BoundaryInfo>} boundaryIndex
 * @returns {{ chainOverlays: Map, kinkHighlights: Set, bubbleHighlights: Set }}
 */
export function resolvePathByBoundaries(steps, boundaryIndex) {
    const chainOverlays = new Map();
    const kinkHighlights = new Set();
    const bubbleHighlights = new Set();

    let inChain = null; // { chainId, container, entryT }

    for (const step of steps) {
        const segKey = `s${step.segId}`;
        const boundary = boundaryIndex.get(segKey);

        if (!boundary) {
            // Not a boundary segment — if we're in a chain, it's an interior
            // segment (implicitly covered). If not, it's unresolved.
            continue;
        }

        // Check if this is a junction SegmentObject (not on a chain)
        const obj = registry.resolve(segKey);
        if (obj && obj.constructor.name === 'SegmentObject') {
            // Emit as kink highlight
            kinkHighlights.add(obj);
            continue;
        }

        if (boundary.role === 'entry') {
            // If we were already in a chain, close it first
            if (inChain) {
                _emitChainOverlay(chainOverlays, inChain.chainId,
                    inChain.entryT, inChain.segment.tRange.end);
            }
            inChain = {
                chainId: boundary.chainId,
                container: boundary.container,
                segment: boundary.segment,
                entryT: boundary.segment.tRange.start,
            };
        } else if (boundary.role === 'exit') {
            if (inChain && inChain.chainId === boundary.chainId) {
                // Normal exit — emit range from entry to this exit
                _emitChainOverlay(chainOverlays, inChain.chainId,
                    inChain.entryT, boundary.segment.tRange.end);
                inChain = null;
            } else {
                // Exit without matching entry — path started mid-chain
                // Emit from start of this segment's range
                _emitChainOverlay(chainOverlays, boundary.chainId,
                    boundary.segment.tRange.start, boundary.segment.tRange.end);
                inChain = null;
            }
        }
    }

    // Close any open chain at end of path
    if (inChain) {
        _emitChainOverlay(chainOverlays, inChain.chainId,
            inChain.entryT, inChain.segment.tRange.end);
    }

    return { chainOverlays, kinkHighlights, bubbleHighlights };
}

/**
 * Add a t-range to the chain overlay map.
 */
function _emitChainOverlay(chainOverlays, chainId, tStart, tEnd) {
    if (!chainOverlays.has(chainId)) {
        chainOverlays.set(chainId, { tRanges: [] });
    }
    chainOverlays.get(chainId).tRanges.push({ start: tStart, end: tEnd });
}

// -------------------------------------------------------------------
// Convenience: build + resolve in one call
// -------------------------------------------------------------------

/**
 * Build the boundary index and resolve a path in one step.
 * @param {Array<{segId: number, direction: string}>} steps
 * @returns {{ chainOverlays: Map, kinkHighlights: Set, bubbleHighlights: Set }}
 */
export function resolveAndBuildRenderData(steps) {
    const boundaryIndex = buildBoundaryIndex();
    return resolvePathByBoundaries(steps, boundaryIndex);
}
