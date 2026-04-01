// Chain polyline hover detection, rectangle selection, and tooltip formatting.

import { state } from '../../../simplify-state.js';
import { pointToSegmentDist } from '../../../utils/geometry.js';
import { getPolychainPositions, getPolychainPolylines, cumulativeLengths } from '../../data/polychain/polychain-adapter.js';
import { getBubblePositions } from '../../data/bubble-meta-cache.js';

const HIT_RADIUS_PX = 12;

export function hitTestChains(dataX, dataY) {
    if (!state.detailData || state.detailOpacity < 0.5) return null;
    const hitR = HIT_RADIUS_PX / state.zoom;
    let bestDist = hitR;
    let bestChain = null;

    for (const chain of state.detailData.chains) {
        const polylines = getPolychainPolylines(chain.id);
        if (!polylines && chain.parentChain) continue;
        const pls = polylines || [chain.polyline];
        for (const pl of pls) {
            for (let i = 0; i < pl.length - 1; i++) {
                const d = pointToSegmentDist(dataX, dataY, pl[i][0], pl[i][1], pl[i+1][0], pl[i+1][1]);
                if (d < bestDist) {
                    bestDist = d;
                    bestChain = chain;
                }
            }
        }
    }
    return bestChain;
}

export function chainsInRect(minX, minY, maxX, maxY) {
    if (!state.detailData) return [];
    const result = [];
    for (const chain of state.detailData.chains) {
        const pl = getPolychainPositions(chain.id) || chain.polyline;
        if (!pl || pl.length < 2) continue;

        // Quick AABB rejection
        let plMinX = Infinity, plMaxX = -Infinity;
        let plMinY = Infinity, plMaxY = -Infinity;
        for (let i = 0; i < pl.length; i++) {
            const x = pl[i][0], y = pl[i][1];
            if (x < plMinX) plMinX = x;
            if (x > plMaxX) plMaxX = x;
            if (y < plMinY) plMinY = y;
            if (y > plMaxY) plMaxY = y;
        }
        if (plMaxX < minX || plMinX > maxX || plMaxY < minY || plMinY > maxY) continue;

        // Compute cumulative arc lengths
        const cumLen = cumulativeLengths(pl);
        const totalLen = cumLen[cumLen.length - 1];
        if (totalLen === 0) continue;

        // Walk each segment, clip to rect, track min/max arc-length inside rect
        let arcMin = Infinity, arcMax = -Infinity;
        for (let i = 0; i < pl.length - 1; i++) {
            // Check if vertex itself is inside rect
            const vx = pl[i][0], vy = pl[i][1];
            if (vx >= minX && vx <= maxX && vy >= minY && vy <= maxY) {
                const d = cumLen[i];
                if (d < arcMin) arcMin = d;
                if (d > arcMax) arcMax = d;
            }

            const clip = clipSegmentToRect(
                pl[i][0], pl[i][1], pl[i+1][0], pl[i+1][1],
                minX, minY, maxX, maxY);
            if (!clip) continue;

            const segLen = cumLen[i + 1] - cumLen[i];
            const d0 = cumLen[i] + clip.tMin * segLen;
            const d1 = cumLen[i] + clip.tMax * segLen;
            if (d0 < arcMin) arcMin = d0;
            if (d1 > arcMax) arcMax = d1;
        }
        // Check last vertex
        const lx = pl[pl.length - 1][0], ly = pl[pl.length - 1][1];
        if (lx >= minX && lx <= maxX && ly >= minY && ly <= maxY) {
            const d = cumLen[pl.length - 1];
            if (d < arcMin) arcMin = d;
            if (d > arcMax) arcMax = d;
        }

        if (!isFinite(arcMin)) continue;

        result.push({
            chain,
            tStart: arcMin / totalLen,
            tEnd: arcMax / totalLen,
        });
    }
    return result;
}

/**
 * Clip a line segment to an axis-aligned rect using parametric clipping.
 * Returns { tMin, tMax } (segment-local t ∈ [0,1]) or null if no intersection.
 */
function clipSegmentToRect(ax, ay, bx, by, minX, minY, maxX, maxY) {
    const dx = bx - ax, dy = by - ay;

    let tMin = 0, tMax = 1;
    if (dx !== 0) {
        let t1 = (minX - ax) / dx, t2 = (maxX - ax) / dx;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return null;
    } else {
        if (ax < minX || ax > maxX) return null;
    }
    if (dy !== 0) {
        let t1 = (minY - ay) / dy, t2 = (maxY - ay) / dy;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return null;
    } else {
        if (ay < minY || ay > maxY) return null;
    }
    return { tMin, tMax };
}

/**
 * Hit-test all bubble circles across all visible chains.
 * Uses precomputed positions from the render pass (stored in bubble-meta-cache).
 * Returns { x, y, meta, chainId } or null.
 */
export function hitTestBubbleCircles(dataX, dataY) {
    if (!state.detailData || state.detailOpacity < 0.5) return null;
    const hitR = HIT_RADIUS_PX / state.zoom;
    const gridSize = state.targetGridSize;
    let bestDist = hitR;
    let best = null;

    for (const chain of state.detailData.chains) {
        const positions = getBubblePositions(chain.id);
        if (!positions || positions.length === 0) continue;
        for (const { x, y, meta } of positions) {
            // Skip bubbles not yet visible at current zoom
            if (gridSize > (meta.threshold || 20)) continue;
            const d = Math.hypot(dataX - x, dataY - y);
            if (d < bestDist) {
                bestDist = d;
                best = { x, y, meta, chainId: chain.id };
            }
        }
    }
    return best;
}

export function getBubbleCircleTooltip(hit) {
    const meta = hit.meta;
    const gcPct = meta.length > 0
        ? ((meta.gc_count / meta.length) * 100).toFixed(1) + '%' : '?';
    // Trim connector suffix (e.g. "c42:5-10" → "c42")
    const chainLabel = hit.chainId.split(':')[0];
    return {
        bubble: meta.id,
        chain: chainLabel,
        type: meta.subtype,
        length: meta.length,
        gc: gcPct,
    };
}

export function getChainTooltip(chain) {
    // Show the root chain identity — subchains (c42:0, c42:1) are all
    // pieces of the same chain, so display the root ID.
    const rootId = chain.id.split(':')[0];
    let label = rootId;
    if (chain.ancestors?.length > 0) {
        const parts = [];
        for (const a of chain.ancestors) {
            parts.push(a.chain);
            if (a.bubble) parts.push(a.bubble);
        }
        parts.push(rootId);
        label = parts.join(' > ');
    }

    const gcPct = chain.length > 0 ? ((chain.gcCount / chain.length) * 100).toFixed(1) + '%' : '?';
    return {
        chain: label,
        type: chain.subtype,
        length: chain.length,
        gc: gcPct,
        steps: chain.stepCount,
        bubbles: chain.nBubbles,
        polyline: (getPolychainPositions(chain.id) || chain.polyline).length,
        loop: chain.loopFactor != null ? chain.loopFactor.toFixed(2) : '?',
        depth: chain.depth,
    };
}
