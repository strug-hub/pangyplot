// Chain polyline hover detection, rectangle selection, and tooltip formatting.

import { state } from '../../../simplify-state.js';
import { pointToSegmentDist } from '../../../utils/geometry.js';
import { getPolychainPositions } from '../../data/polychain/polychain-adapter.js';

const HIT_RADIUS_PX = 12;

export function hitTestChains(dataX, dataY) {
    if (!state.detailData || state.detailOpacity < 0.5) return null;
    const hitR = HIT_RADIUS_PX / state.zoom;
    let bestDist = hitR;
    let bestChain = null;

    for (const chain of state.detailData.chains) {
        const pl = getPolychainPositions(chain.id) || chain.polyline;
        for (let i = 0; i < pl.length - 1; i++) {
            const d = pointToSegmentDist(dataX, dataY, pl[i][0], pl[i][1], pl[i+1][0], pl[i+1][1]);
            if (d < bestDist) {
                bestDist = d;
                bestChain = chain;
            }
        }
    }
    return bestChain;
}

export function chainsInRect(minX, minY, maxX, maxY) {
    if (!state.detailData) return [];
    const chains = state.detailData.chains;
    if (chains.length > 0) {
        const c0 = chains[0];
        const pl0 = c0.polyline;
        console.log('chainsInRect', {
            rect: { minX, minY, maxX, maxY },
            chainCount: chains.length,
            poppedCount: state.poppedChainIds?.size ?? 0,
            chain0: { id: c0.id, plLen: pl0?.length, first: pl0?.[0], last: pl0?.[pl0?.length - 1] },
        });
    }
    const result = [];
    for (const chain of state.detailData.chains) {
        const pl = getPolychainPositions(chain.id) || chain.polyline;
        if (!pl || pl.length === 0) continue;

        let plMinX = Infinity, plMaxX = -Infinity;
        let plMinY = Infinity, plMaxY = -Infinity;
        for (let i = 0; i < pl.length; i++) {
            const x = pl[i][0], y = pl[i][1];
            if (x < plMinX) plMinX = x;
            if (x > plMaxX) plMaxX = x;
            if (y < plMinY) plMinY = y;
            if (y > plMaxY) plMaxY = y;
        }
        if (plMaxX < minX || plMinX > maxX || plMaxY < minY || plMinY > maxY) {
            continue;
        }

        let hit = false;
        for (let i = 0; i < pl.length; i++) {
            const x = pl[i][0], y = pl[i][1];
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                hit = true;
                break;
            }
        }
        if (!hit) {
            for (let i = 0; i < pl.length - 1; i++) {
                if (segmentIntersectsRect(pl[i][0], pl[i][1], pl[i+1][0], pl[i+1][1], minX, minY, maxX, maxY)) {
                    hit = true;
                    break;
                }
            }
        }
        if (hit) result.push(chain);
    }
    console.log('chainsInRect result', { hits: result.length });
    return result;
}

function segmentIntersectsRect(ax, ay, bx, by, minX, minY, maxX, maxY) {
    const dx = bx - ax, dy = by - ay;

    let tMin = 0, tMax = 1;
    if (dx !== 0) {
        let t1 = (minX - ax) / dx, t2 = (maxX - ax) / dx;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return false;
    } else {
        if (ax < minX || ax > maxX) return false;
    }
    if (dy !== 0) {
        let t1 = (minY - ay) / dy, t2 = (maxY - ay) / dy;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return false;
    } else {
        if (ay < minY || ay > maxY) return false;
    }
    return true;
}

export function getChainTooltip(chain) {
    // Show ancestry: walk the ancestors array (each has chain + bubble)
    let label = chain.id;
    if (chain.ancestors?.length > 0) {
        const parts = [];
        for (const a of chain.ancestors) {
            parts.push(a.chain);
            if (a.bubble) parts.push(a.bubble);
        }
        parts.push(chain.id);
        label = parts.join(' > ');
    }

    return {
        chain: label,
        type: chain.subtype,
        length: chain.length,
        steps: chain.stepCount,
        bubbles: chain.nBubbles,
        polyline: (getPolychainPositions(chain.id) || chain.polyline).length,
        loop: chain.loopFactor != null ? chain.loopFactor.toFixed(2) : '?',
        depth: chain.depth,
    };
}
