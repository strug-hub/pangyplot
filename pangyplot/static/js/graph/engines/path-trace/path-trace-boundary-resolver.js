/**
 * Boundary-based path resolver.
 *
 * Resolves decoded path steps to render data + animation waypoints by matching
 * against registered boundary segments (chain entries/exits, junction nodes).
 *
 * State machine:
 *   idle → hit chain entry → inChain → hit chain exit → emit chain + waypoints → idle
 *   idle → hit junction segment → emit as kink highlight + waypoint → idle
 */

import * as registry from '../../detail/model/segment-registry.js';
import { getAllContainers } from '../../detail/model/model-manager.js';

// -------------------------------------------------------------------
// Boundary index
// -------------------------------------------------------------------

/**
 * Build an index mapping segment IDs to their boundary role.
 *
 * For each container's segments, headSegs are entries and tailSegs are exits.
 * When bubbles are popped, split segments register additional boundaries,
 * giving finer-grained entry/exit points within the chain.
 *
 * @returns {Map<string, {chainId, role, container, segment}>}
 */
export function buildBoundaryIndex() {
    const index = new Map();

    for (const [chainId, container] of getAllContainers()) {
        for (const seg of container.segments) {
            for (const segId of seg.ends.head) {
                index.set(String(segId), {
                    chainId,
                    role: 'entry',
                    container,
                    segment: seg,
                });
            }
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
// Path resolution + waypoint building
// -------------------------------------------------------------------

/**
 * Resolve a decoded path against the boundary index.
 * Produces both render data (chain overlays, highlights) and animation waypoints.
 *
 * @param {Array<{segId: number, direction: string}>} steps
 * @param {Map} boundaryIndex
 * @returns {{ chainOverlays: Map, kinkHighlights: Set, bubbleHighlights: Set, waypoints: Array }}
 */
export function resolvePathByBoundaries(steps, boundaryIndex) {
    const chainOverlays = new Map();
    const kinkHighlights = new Set();
    const bubbleHighlights = new Set();
    const waypoints = [];

    let inChain = null; // { chainId, container, segment, entryT }

    for (const step of steps) {
        const segKey = `s${step.segId}`;
        const boundary = boundaryIndex.get(segKey);

        if (!boundary) continue;

        // Junction SegmentObject (not on a chain)
        const obj = registry.resolve(segKey);
        if (obj && obj.constructor.name === 'SegmentObject') {
            // Close any open chain first
            if (inChain) {
                _emitChain(chainOverlays, waypoints, inChain);
                inChain = null;
            }
            kinkHighlights.add(obj);
            _emitJunction(waypoints, obj);
            continue;
        }

        if (boundary.role === 'entry') {
            if (inChain) {
                _emitChain(chainOverlays, waypoints, inChain);
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
                _emitChain(chainOverlays, waypoints, inChain);
                inChain = null;
            } else {
                // Exit without matching entry
                _emitChain(chainOverlays, waypoints, {
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
        _emitChain(chainOverlays, waypoints, inChain);
    }

    // Compute cumulative distances
    _computeDistances(waypoints);

    return { chainOverlays, kinkHighlights, bubbleHighlights, waypoints };
}

// -------------------------------------------------------------------
// Chain waypoint emission
// -------------------------------------------------------------------

/**
 * Emit chain overlay + waypoints for a chain traversal.
 * Samples the spine polyline and inserts bubble waypoints at their t-positions.
 */
function _emitChain(chainOverlays, waypoints, chain) {
    const { chainId, container, entryT, exitT } = chain;

    // Add to render data
    if (!chainOverlays.has(chainId)) {
        chainOverlays.set(chainId, { tRanges: [] });
    }
    chainOverlays.get(chainId).tRanges.push({ start: entryT, end: exitT });

    // Get polyline points along the spine
    const polyline = container.polylineInRange(entryT, exitT);
    if (polyline.length === 0) return;

    // Get unpopped bubbles in this range for bubble waypoints
    const bubbles = container.bubblesInRange(entryT, exitT);
    const bubblesByT = bubbles.map(b => ({
        t: b.t,
        pos: container.positionAt(b.t),
        bubble: b,
    })).sort((a, b) => a.t - b.t);

    // Build waypoints: interleave polyline points with bubble positions
    // First, create polyline waypoints with approximate t-values
    const polyWaypoints = polyline.map((pt, i) => {
        const tFrac = polyline.length > 1 ? i / (polyline.length - 1) : 0;
        const t = entryT + tFrac * (exitT - entryT);
        return {
            pos: { x: pt[0], y: pt[1] },
            t,
            action: i === 0 ? 'enter-chain' : i === polyline.length - 1 ? 'exit-chain' : 'chain-point',
            chainId,
            container,
        };
    });

    // Insert bubble waypoints at their correct t-positions
    let polyIdx = 0;
    for (const bw of bubblesByT) {
        // Advance polyIdx to the point just past this bubble's t
        while (polyIdx < polyWaypoints.length && polyWaypoints[polyIdx].t < bw.t) {
            waypoints.push(polyWaypoints[polyIdx]);
            polyIdx++;
        }
        waypoints.push({
            pos: bw.pos,
            t: bw.t,
            action: 'bubble',
            chainId,
            container,
            bubble: bw.bubble,
        });
    }

    // Emit remaining polyline waypoints
    while (polyIdx < polyWaypoints.length) {
        waypoints.push(polyWaypoints[polyIdx]);
        polyIdx++;
    }
}

// -------------------------------------------------------------------
// Junction waypoint emission
// -------------------------------------------------------------------

function _emitJunction(waypoints, obj) {
    if (!obj.physicsNodes?.length) return;
    const n = obj.physicsNodes[0];
    if (n.x == null) return;

    waypoints.push({
        pos: { x: n.x, y: n.y },
        action: 'junction',
        object: obj,
    });
}

// -------------------------------------------------------------------
// Cumulative distance computation
// -------------------------------------------------------------------

function _computeDistances(waypoints) {
    if (waypoints.length === 0) return;

    waypoints[0].dist = 0;
    for (let i = 1; i < waypoints.length; i++) {
        const prev = waypoints[i - 1].pos;
        const curr = waypoints[i].pos;
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        waypoints[i].dist = waypoints[i - 1].dist + Math.sqrt(dx * dx + dy * dy);
    }
}

// -------------------------------------------------------------------
// Convenience
// -------------------------------------------------------------------

/**
 * Build the boundary index and resolve a path in one step.
 * @param {Array<{segId: number, direction: string}>} steps
 * @returns {{ chainOverlays: Map, kinkHighlights: Set, bubbleHighlights: Set, waypoints: Array }}
 */
export function resolveAndBuildRenderData(steps) {
    const boundaryIndex = buildBoundaryIndex();
    return resolvePathByBoundaries(steps, boundaryIndex);
}
