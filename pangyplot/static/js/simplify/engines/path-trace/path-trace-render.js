// Path trace rendering: chain overlays, kink highlights, bubble rings, animation tail.

import { state } from '../../simplify-state.js';
import { renderData, resolvedPath, animationCursor } from './path-trace-state.js';
import { getContainer } from '../../detail/model/model-manager.js';
import {
    strokePolylines, strokeSegments, fillCircles, strokeRing,
} from '../../detail/render/detail-painter.js';

const PATH_COLOR = '#FFFFFF';
const TAIL_LENGTH = 80;  // number of steps the tail spans behind the cursor

/**
 * Main path trace render pass.
 * Call from render-manager after drawForceGraph(), inside data-space transform.
 */
export function drawPathTrace(ctx, baseWidth, opacity, vp) {
    if (!renderData) return;

    const pathWidth = Math.max(1.5, baseWidth * 0.6);
    const animating = animationCursor >= 0 && animationCursor < resolvedPath.length;

    // --- 1. Chain polyline overlays (static highlight, dimmed during animation) ---
    const staticAlpha = animating ? 0.15 : 0.85;
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
        strokePolylines(ctx, chainPolylines, PATH_COLOR, pathWidth, staticAlpha * opacity);
    }

    // --- 2. Kink link highlights (static, dimmed during animation) ---
    const kinkSegs = [];
    for (const obj of renderData.kinkHighlights) {
        if (!obj.physicsLinks) continue;
        for (const link of obj.physicsLinks) {
            const s = link.source, t = link.target;
            if (s.x != null && t.x != null) {
                kinkSegs.push({ x1: s.x, y1: s.y, x2: t.x, y2: t.y });
            }
        }
    }
    if (kinkSegs.length > 0) {
        strokeSegments(ctx, kinkSegs, PATH_COLOR, pathWidth, staticAlpha * opacity);
    }

    // --- 3. Node circles (static, dimmed during animation) ---
    const nodeCircles = [];
    for (const obj of renderData.kinkHighlights) {
        if (!obj.physicsNodes) continue;
        for (const n of obj.physicsNodes) {
            if (n.x != null && !n.isAnchor) {
                nodeCircles.push({ x: n.x, y: n.y, r: baseWidth * 0.5 });
            }
        }
    }
    if (nodeCircles.length > 0) {
        fillCircles(ctx, nodeCircles, PATH_COLOR, staticAlpha * opacity);
    }

    // --- 4. Bubble rings (static, dimmed during animation) ---
    for (const obj of renderData.bubbleHighlights) {
        if (!obj.physicsNodes) continue;
        const n = obj.physicsNodes[0];
        if (n && n.x != null) {
            strokeRing(ctx, n.x, n.y, baseWidth * 1.3, PATH_COLOR,
                Math.max(0.5, pathWidth * 0.5), staticAlpha * opacity);
        }
    }

    // --- 5. Animation tail + pulse ---
    if (animating) {
        _drawAnimationTail(ctx, baseWidth, pathWidth, opacity, vp);
    }
}

// ---------------------------------------------------------------
// Animation tail: fading trail behind the cursor
// ---------------------------------------------------------------

/**
 * Maximum pixel distance (in data space) for drawing a connecting line
 * between consecutive steps. Beyond this, it's a "jump" — skip the line.
 */
const MAX_CONNECT_DIST_SQ = 500 * 500;

function _drawAnimationTail(ctx, baseWidth, pathWidth, opacity, vp) {
    const cursor = animationCursor;
    const tailStart = Math.max(0, cursor - TAIL_LENGTH);

    // Pre-compute positions for tail range, skip unresolved/off-screen
    const positions = [];  // { idx, pos, alpha }
    for (let i = tailStart; i <= cursor; i++) {
        const step = resolvedPath[i];
        if (!step || step.resolveType === 'unresolved') continue;

        const pos = _getStepPosition(step);
        if (!pos) continue;

        // Skip positions outside viewport (with margin)
        if (vp && (pos.x < vp.minX || pos.x > vp.maxX ||
                   pos.y < vp.minY || pos.y > vp.maxY)) continue;

        // Fade: 1.0 at cursor, 0.0 at tailStart
        const t = cursor === tailStart ? 1 : (i - tailStart) / (cursor - tailStart);
        positions.push({ idx: i, pos, alpha: t * t, step });
    }

    // Batch into opacity buckets
    const BUCKETS = 8;
    const bucketCircles = Array.from({ length: BUCKETS }, () => []);
    const bucketSegs = Array.from({ length: BUCKETS }, () => []);

    for (let p = 0; p < positions.length; p++) {
        const { pos, alpha } = positions[p];
        const bucket = Math.min(BUCKETS - 1, Math.floor(alpha * BUCKETS));

        bucketCircles[bucket].push({ x: pos.x, y: pos.y, r: baseWidth * 0.4 });

        // Connect to previous position only if close enough (same visual region)
        if (p > 0) {
            const prev = positions[p - 1];
            const dx = pos.x - prev.pos.x;
            const dy = pos.y - prev.pos.y;
            if (dx * dx + dy * dy < MAX_CONNECT_DIST_SQ) {
                bucketSegs[bucket].push({
                    x1: prev.pos.x, y1: prev.pos.y,
                    x2: pos.x, y2: pos.y,
                });
            }
        }
    }

    // Draw each bucket
    for (let b = 0; b < BUCKETS; b++) {
        const alpha = ((b + 0.5) / BUCKETS) * 0.8;
        if (bucketSegs[b].length > 0) {
            strokeSegments(ctx, bucketSegs[b], PATH_COLOR, pathWidth * 0.8, alpha * opacity);
        }
        if (bucketCircles[b].length > 0) {
            fillCircles(ctx, bucketCircles[b], PATH_COLOR, alpha * opacity);
        }
    }

    // Bright pulse dot at cursor
    const cursorStep = resolvedPath[cursor];
    if (cursorStep) {
        const pos = _getStepPosition(cursorStep);
        if (pos) {
            const pulseR = Math.max(3, baseWidth * 1.8);
            fillCircles(ctx, [{ x: pos.x, y: pos.y, r: pulseR * 0.5 }], PATH_COLOR, 0.95 * opacity);
            strokeRing(ctx, pos.x, pos.y, pulseR, PATH_COLOR,
                Math.max(0.8, baseWidth * 0.4), 0.7 * opacity);
        }
    }
}

/**
 * Get the data-space position for a resolved step.
 */
function _getStepPosition(step) {
    if (step.resolveType === 'chain' && step.chainId && step.tPosition != null) {
        const container = getContainer(step.chainId);
        if (container) return container.positionAt(step.tPosition);
    }
    // For direct/bubble: use first physics node position
    if (step.simObject?.physicsNodes?.length > 0) {
        const n = step.simObject.physicsNodes[0];
        if (n.x != null) return { x: n.x, y: n.y };
    }
    return null;
}
