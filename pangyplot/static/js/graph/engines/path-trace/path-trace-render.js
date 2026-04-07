// Path trace rendering: chain overlays, highlights, frame-based animation with tail.

import { renderData, frames, currentFrame, TAIL_LENGTH } from './path-trace-state.js';
import { getContainer } from '../../detail/model/model-manager.js';
import {
    strokePolylines, fillCircles, strokeRing,
} from '../../detail/render/detail-painter.js';

const PATH_COLOR = '#FFFFFF';

/**
 * Main path trace render pass.
 * Call from render-manager after drawForceGraph(), inside data-space transform.
 */
export function drawPathTrace(ctx, baseWidth, opacity, vp) {
    if (!renderData) return;

    const pathWidth = Math.max(1.5, baseWidth * 0.6);
    const animating = currentFrame >= 0;
    const staticAlpha = animating ? 0.12 : 0.85;

    // --- 1. Static chain overlays (full ranges, dimmed during animation) ---
    _drawChainOverlays(ctx, pathWidth, staticAlpha * opacity);

    // --- 2. Static kink highlights ---
    _drawKinkHighlights(ctx, baseWidth, pathWidth, staticAlpha * opacity);

    // --- 3. Static bubble rings ---
    _drawBubbleHighlights(ctx, baseWidth, pathWidth, staticAlpha * opacity);

    // --- 4. Animation: current frame + tail ---
    if (animating) {
        _drawAnimationFrames(ctx, baseWidth, pathWidth, opacity);
    }
}

// ---------------------------------------------------------------
// Static overlays
// ---------------------------------------------------------------

function _drawChainOverlays(ctx, pathWidth, alpha) {
    const polylines = [];
    for (const [chainId, overlay] of renderData.chainOverlays) {
        const container = getContainer(chainId);
        if (!container) continue;
        for (const range of overlay.tRanges) {
            const pl = container.polylineInRange(range.start, range.end);
            if (pl.length >= 2) polylines.push(pl);
        }
    }
    if (polylines.length > 0) {
        strokePolylines(ctx, polylines, PATH_COLOR, pathWidth, alpha);
    }
}

function _drawKinkHighlights(ctx, baseWidth, pathWidth, alpha) {
    const circles = [];
    for (const obj of renderData.kinkHighlights) {
        if (!obj.physicsNodes) continue;
        for (const n of obj.physicsNodes) {
            if (n.x != null && !n.isAnchor) {
                circles.push({ x: n.x, y: n.y, r: baseWidth * 0.5 });
            }
        }
    }
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
// Animation frame rendering
// ---------------------------------------------------------------

function _drawAnimationFrames(ctx, baseWidth, pathWidth, opacity) {
    const tailStart = Math.max(0, currentFrame - TAIL_LENGTH);

    for (let i = tailStart; i <= currentFrame; i++) {
        const frame = frames[i];
        if (!frame) continue;

        // Opacity: current frame = full, tail = quadratic falloff
        const age = currentFrame - i;
        const alpha = age === 0
            ? 0.9
            : Math.pow(1 - age / (TAIL_LENGTH + 1), 2) * 0.7;

        _drawFrame(ctx, frame, baseWidth, pathWidth, alpha * opacity);
    }
}

function _drawFrame(ctx, frame, baseWidth, pathWidth, alpha) {
    if (frame.type === 'chain') {
        const container = getContainer(frame.chainId);
        if (!container) return;
        const pl = container.polylineInRange(frame.tStart, frame.tEnd);
        if (pl.length >= 2) {
            strokePolylines(ctx, [pl], PATH_COLOR, pathWidth * 1.5, alpha);
        }
    } else if (frame.type === 'junction') {
        const obj = frame.object;
        if (!obj?.physicsNodes) return;
        const n = obj.physicsNodes[0];
        if (n && n.x != null) {
            fillCircles(ctx, [{ x: n.x, y: n.y, r: baseWidth * 1.2 }], PATH_COLOR, alpha);
        }
    }
}
