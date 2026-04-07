/**
 * Boundary-based path resolver.
 *
 * Resolves decoded path steps to render data + animation frames by matching
 * against registered boundary segments (chain entries/exits, junction nodes).
 *
 * State machine:
 *   idle → hit chain entry → inChain → hit chain exit → emit chain frame → idle
 *   idle → hit junction segment → emit junction frame → idle
 */

import * as registry from '../../detail/model/segment-registry.js';
import { getAllContainers } from '../../detail/model/model-manager.js';

// -------------------------------------------------------------------
// Boundary index
// -------------------------------------------------------------------

/**
 * Build an index mapping segment IDs to their boundary role.
 * @returns {Map<string, {chainId, role, container, segment}>}
 */
export function buildBoundaryIndex() {
    const index = new Map();

    for (const [chainId, container] of getAllContainers()) {
        for (const seg of container.segments) {
            for (const segId of seg.ends.head) {
                index.set(String(segId), {
                    chainId, role: 'entry', container, segment: seg,
                });
            }
            for (const segId of seg.ends.tail) {
                index.set(String(segId), {
                    chainId, role: 'exit', container, segment: seg,
                });
            }
        }
    }

    return index;
}

// -------------------------------------------------------------------
// Path resolution + frame building
// -------------------------------------------------------------------

/**
 * Resolve a decoded path against the boundary index.
 * Produces render data (chain overlays, highlights) and animation frames.
 *
 * @param {Array<{segId: number, direction: string}>} steps
 * @param {Map} boundaryIndex
 * @returns {{ chainOverlays: Map, kinkHighlights: Set, bubbleHighlights: Set, frames: Array }}
 */
export function resolvePathByBoundaries(steps, boundaryIndex) {
    const chainOverlays = new Map();
    const kinkHighlights = new Set();
    const bubbleHighlights = new Set();
    const frames = [];

    let inChain = null;

    for (const step of steps) {
        const segKey = `s${step.segId}`;
        const boundary = boundaryIndex.get(segKey);

        if (!boundary) continue;

        // Junction SegmentObject
        const obj = registry.resolve(segKey);
        if (obj && obj.constructor.name === 'SegmentObject') {
            if (inChain) {
                _emitChain(chainOverlays, frames, inChain);
                inChain = null;
            }
            kinkHighlights.add(obj);
            frames.push({ type: 'junction', object: obj });
            continue;
        }

        if (boundary.role === 'entry') {
            if (inChain) {
                _emitChain(chainOverlays, frames, inChain);
            }
            inChain = {
                chainId: boundary.chainId,
                container: boundary.container,
                segment: boundary.segment,
                entryT: boundary.segment.tRange.start,
                exitT: boundary.segment.tRange.end,
            };
        } else if (boundary.role === 'exit') {
            if (inChain && inChain.chainId === boundary.chainId) {
                inChain.exitT = boundary.segment.tRange.end;
                _emitChain(chainOverlays, frames, inChain);
                inChain = null;
            } else {
                _emitChain(chainOverlays, frames, {
                    chainId: boundary.chainId,
                    container: boundary.container,
                    segment: boundary.segment,
                    entryT: boundary.segment.tRange.start,
                    exitT: boundary.segment.tRange.end,
                });
                inChain = null;
            }
        }
    }

    if (inChain) {
        _emitChain(chainOverlays, frames, inChain);
    }

    return { chainOverlays, kinkHighlights, bubbleHighlights, frames };
}

// -------------------------------------------------------------------
// Chain emission
// -------------------------------------------------------------------

/**
 * Emit chain overlay + animation frame(s) for a chain traversal.
 * A single chain traversal becomes one frame. If the chain has popped
 * ranges that split the traversal, multiple partial frames are emitted.
 */
function _emitChain(chainOverlays, frames, chain) {
    const { chainId, container, entryT, exitT } = chain;

    // Add to render data
    if (!chainOverlays.has(chainId)) {
        chainOverlays.set(chainId, { tRanges: [] });
    }
    chainOverlays.get(chainId).tRanges.push({ start: entryT, end: exitT });

    // Check for popped ranges that interrupt this traversal
    const poppedInRange = container.poppedRanges.filter(
        pr => pr.tStart < exitT && pr.tEnd > entryT
    ).sort((a, b) => a.tStart - b.tStart);

    if (poppedInRange.length === 0) {
        // Single uninterrupted frame
        frames.push({ type: 'chain', chainId, tStart: entryT, tEnd: exitT, container });
        return;
    }

    // Split into partial chain frames around popped ranges
    let cursor = entryT;
    for (const pr of poppedInRange) {
        if (pr.tStart > cursor) {
            frames.push({ type: 'chain', chainId, tStart: cursor, tEnd: pr.tStart, container });
        }
        // TODO: emit frames for popped bubble internal contents here
        cursor = pr.tEnd;
    }
    if (cursor < exitT) {
        frames.push({ type: 'chain', chainId, tStart: cursor, tEnd: exitT, container });
    }
}

// -------------------------------------------------------------------
// Convenience
// -------------------------------------------------------------------

/**
 * Build the boundary index and resolve a path in one step.
 * @param {Array<{segId: number, direction: string}>} steps
 * @returns {{ chainOverlays: Map, kinkHighlights: Set, bubbleHighlights: Set, frames: Array }}
 */
export function resolveAndBuildRenderData(steps) {
    const boundaryIndex = buildBoundaryIndex();
    return resolvePathByBoundaries(steps, boundaryIndex);
}
