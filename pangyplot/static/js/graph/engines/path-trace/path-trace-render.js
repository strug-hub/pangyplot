// Path trace rendering: chain overlays, kink highlights, bubble rings, animation cursor + tail.

import {
    renderData, waypoints, cursorDist, activeHighlights, chainProgress,
} from './path-trace-state.js';
import { getCursorPosition } from './path-trace-animation.js';
import { getContainer } from '../../detail/model/model-manager.js';
import {
    strokePolylines, strokeSegments, fillCircles, strokeRing,
} from '../../detail/render/detail-painter.js';

const PATH_COLOR = '#FFFFFF';
const TAIL_DIST = 200;  // layout-space distance for the fading tail

/**
 * Main path trace render pass.
 * Call from render-manager after drawForceGraph(), inside data-space transform.
 */
export function drawPathTrace(ctx, baseWidth, opacity, vp) {
    if (!renderData) return;

    const pathWidth = Math.max(1.5, baseWidth * 0.6);
    const animating = cursorDist >= 0;

    // --- 1. Chain polyline overlays ---
    const staticAlpha = animating ? 0.15 : 0.85;
    _drawChainOverlays(ctx, pathWidth, staticAlpha * opacity, animating);

    // --- 2. Kink / junction highlights ---
    _drawKinkHighlights(ctx, baseWidth, pathWidth, staticAlpha * opacity);

    // --- 3. Bubble rings ---
    _drawBubbleHighlights(ctx, baseWidth, pathWidth, staticAlpha * opacity);

    // --- 4. Animation: progressive overlay + tail + cursor ---
    if (animating) {
        _drawProgressiveOverlays(ctx, pathWidth, opacity);
        _drawAnimationTail(ctx, baseWidth, pathWidth, opacity);
        _drawCursor(ctx, baseWidth, opacity);
    }
}

// ---------------------------------------------------------------
// Static overlays (full chain ranges, dimmed during animation)
// ---------------------------------------------------------------

function _drawChainOverlays(ctx, pathWidth, alpha, dimmed) {
    const chainPolylines = [];
    for (const [chainId, overlay] of renderData.chainOverlays) {
        const container = getContainer(chainId);
        if (!container) continue;
        for (const range of overlay.tRanges) {
            const pl = container.polylineInRange(range.start, range.end);
            if (pl.length >= 2) chainPolylines.push(pl);
        }
    }
    if (chainPolylines.length > 0) {
        strokePolylines(ctx, chainPolylines, PATH_COLOR, pathWidth, alpha);
    }
}

function _drawKinkHighlights(ctx, baseWidth, pathWidth, alpha) {
    const segs = [];
    const circles = [];
    for (const obj of renderData.kinkHighlights) {
        if (obj.physicsLinks) {
            for (const link of obj.physicsLinks) {
                const s = link.source, t = link.target;
                if (s.x != null && t.x != null) {
                    segs.push({ x1: s.x, y1: s.y, x2: t.x, y2: t.y });
                }
            }
        }
        if (obj.physicsNodes) {
            for (const n of obj.physicsNodes) {
                if (n.x != null && !n.isAnchor) {
                    circles.push({ x: n.x, y: n.y, r: baseWidth * 0.5 });
                }
            }
        }
    }
    if (segs.length > 0) strokeSegments(ctx, segs, PATH_COLOR, pathWidth, alpha);
    if (circles.length > 0) fillCircles(ctx, circles, PATH_COLOR, alpha);
}

function _drawBubbleHighlights(ctx, baseWidth, pathWidth, alpha) {
    for (const obj of renderData.bubbleHighlights) {
        if (!obj.physicsNodes) continue;
        const n = obj.physicsNodes[0];
        if (n && n.x != null) {
            strokeRing(ctx, n.x, n.y, baseWidth * 1.3, PATH_COLOR,
                Math.max(0.5, pathWidth * 0.5), alpha);
        }
    }
}

// ---------------------------------------------------------------
// Progressive chain overlay (grows as cursor advances)
// ---------------------------------------------------------------

function _drawProgressiveOverlays(ctx, pathWidth, opacity) {
    const polylines = [];

    for (const [chainId, tCurrent] of chainProgress) {
        const container = getContainer(chainId);
        if (!container) continue;

        // Find the entry t for this chain from renderData
        const overlay = renderData.chainOverlays.get(chainId);
        if (!overlay) continue;

        for (const range of overlay.tRanges) {
            const tEnd = Math.min(tCurrent, range.end);
            if (tEnd <= range.start) continue;
            const pl = container.polylineInRange(range.start, tEnd);
            if (pl.length >= 2) polylines.push(pl);
        }
    }

    if (polylines.length > 0) {
        strokePolylines(ctx, polylines, PATH_COLOR, pathWidth, 0.85 * opacity);
    }

    // Draw highlighted junctions/bubbles from animation
    const circles = [];
    for (const obj of activeHighlights) {
        if (!obj.physicsNodes) continue;
        const n = obj.physicsNodes[0];
        if (n && n.x != null) {
            circles.push({ x: n.x, y: n.y, r: pathWidth * 1.2 });
        }
    }
    if (circles.length > 0) {
        fillCircles(ctx, circles, PATH_COLOR, 0.8 * opacity);
    }
}

// ---------------------------------------------------------------
// Animation tail (fading trail behind cursor)
// ---------------------------------------------------------------

function _drawAnimationTail(ctx, baseWidth, pathWidth, opacity) {
    const curPos = getCursorPosition();
    if (!curPos) return;

    const tailStart = Math.max(0, cursorDist - TAIL_DIST);

    // Collect waypoints in the tail range
    const BUCKETS = 6;
    const bucketCircles = Array.from({ length: BUCKETS }, () => []);
    const bucketSegs = Array.from({ length: BUCKETS }, () => []);

    let prevPos = null;
    for (const wp of waypoints) {
        if (wp.dist < tailStart) continue;
        if (wp.dist > cursorDist) break;

        const alpha = TAIL_DIST > 0 ? (wp.dist - tailStart) / TAIL_DIST : 1;
        const bucket = Math.min(BUCKETS - 1, Math.floor(alpha * BUCKETS));

        bucketCircles[bucket].push({ x: wp.pos.x, y: wp.pos.y, r: baseWidth * 0.35 });

        if (prevPos) {
            const dx = wp.pos.x - prevPos.x;
            const dy = wp.pos.y - prevPos.y;
            // Only connect if reasonably close (same visual region)
            if (dx * dx + dy * dy < 500 * 500) {
                bucketSegs[bucket].push({
                    x1: prevPos.x, y1: prevPos.y,
                    x2: wp.pos.x, y2: wp.pos.y,
                });
            }
        }
        prevPos = wp.pos;
    }

    for (let b = 0; b < BUCKETS; b++) {
        const a = ((b + 0.5) / BUCKETS) * 0.7;
        if (bucketSegs[b].length > 0) {
            strokeSegments(ctx, bucketSegs[b], PATH_COLOR, pathWidth * 0.7, a * opacity);
        }
        if (bucketCircles[b].length > 0) {
            fillCircles(ctx, bucketCircles[b], PATH_COLOR, a * opacity);
        }
    }
}

// ---------------------------------------------------------------
// Cursor dot
// ---------------------------------------------------------------

function _drawCursor(ctx, baseWidth, opacity) {
    const pos = getCursorPosition();
    if (!pos) return;

    const pulseR = Math.max(3, baseWidth * 1.8);
    fillCircles(ctx, [{ x: pos.x, y: pos.y, r: pulseR * 0.5 }], PATH_COLOR, 0.95 * opacity);
    strokeRing(ctx, pos.x, pos.y, pulseR, PATH_COLOR,
        Math.max(0.8, baseWidth * 0.4), 0.7 * opacity);
}
