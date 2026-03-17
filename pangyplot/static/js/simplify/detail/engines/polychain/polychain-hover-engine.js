// Chain polyline hover detection, rectangle selection, and tooltip formatting.

import { state } from '../../../simplify-state.js';
import { pointToSegmentDist } from '../../../utils/geometry.js';
import { getChainMeta } from '../../../data/chromosome-data.js';

const HIT_RADIUS_PX = 12;

export function hitTestChains(dataX, dataY) {
    if (!state.detailData || state.detailOpacity < 0.5) return null;
    const hitR = HIT_RADIUS_PX / state.zoom;
    let bestDist = hitR;
    let bestChain = null;

    for (const chain of state.detailData.chains) {
        const pl = chain.polyline;
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
    const result = [];
    for (const chain of state.detailData.chains) {
        if (state.poppedChainIds && state.poppedChainIds.has(chain.id)) continue;
        const pl = chain.polyline;
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
        if (plMaxX < minX || plMinX > maxX || plMaxY < minY || plMinY > maxY) continue;

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

// ---------------------------------------------------------------
// Junction link hit testing + tooltip
// ---------------------------------------------------------------

export function hitTestJunctionLinks(dataX, dataY) {
    if (!state.detailData?.junctionLinks || state.detailOpacity < 0.5) return null;
    const hitR = HIT_RADIUS_PX / state.zoom;
    let bestDist = hitR;
    let bestLink = null;

    for (const jl of state.detailData.junctionLinks) {
        const [[ax, ay], [bx, by]] = jl.coords;
        const d = pointToSegmentDist(dataX, dataY, ax, ay, bx, by);
        if (d < bestDist) {
            bestDist = d;
            bestLink = jl;
        }
    }
    return bestLink;
}

export function getJunctionLinkTooltip(jl) {
    const [sidA, sidB] = jl.segs;
    const segChains = state.detailData?.junctionSegChains || {};
    const chainsA = segChains[`s${sidA}`] || [];
    const chainsB = segChains[`s${sidB}`] || [];
    const allChains = [...new Set([...chainsA, ...chainsB])];

    return {
        link: `s${sidA} — s${sidB}`,
        chains: allChains.length > 0 ? allChains.join(', ') : null,
    };
}

export function getChainTooltip(chain) {
    // Show ancestry for full chains, but not partial connector segments (c122:xxx-yyy)
    let label = chain.id;
    if (!chain.id.includes(':') && chain.parentChain) {
        const parts = [chain.id];
        const chainMeta = getChainMeta();
        // First level: use the chain's own parentBubble from the API response
        if (chain.parentBubble) {
            parts.push(chain.parentBubble);
        }
        let cur = chain.parentChain;
        while (cur) {
            parts.push(cur);
            const numId = cur.startsWith('c') ? cur.slice(1) : cur;
            const meta = chainMeta?.[numId];
            // Deeper levels: use chainMeta for parent bubble info
            if (meta?.parent_bubble != null) {
                parts.push(`b${meta.parent_bubble}`);
            }
            cur = meta?.parent != null ? `c${meta.parent}` : null;
        }
        parts.reverse();
        label = parts.join(' > ');
    }

    return {
        chain: label,
        type: chain.subtype,
        length: chain.length,
        steps: chain.stepCount,
        bubbles: chain.nBubbles,
        polyline: chain.polyline.length,
        depth: chain.depth,
    };
}
