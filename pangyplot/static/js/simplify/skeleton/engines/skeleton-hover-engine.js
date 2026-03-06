// Skeleton polyline hover detection and tooltip formatting.

import { state } from '../../simplify-state.js';
import { getViewport } from '../../render/viewport.js';
import { getLevel, getLevelBboxes, getChainMeta } from '../data/skeleton-data.js';

const SKELETON_HIT_RADIUS_PX = 14;

function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTestSkeleton(dataX, dataY) {
    const level = getLevel();
    if (!level || !level.chainIds) return null;

    const hitR = SKELETON_HIT_RADIUS_PX / state.zoom;
    const bboxes = getLevelBboxes();
    const vp = getViewport();
    const margin = (level.gridSize || 50) * 2;

    let bestDist = hitR;
    let bestHit = null;

    for (let i = 0; i < level.polylines.length; i++) {
        const cid = level.chainIds[i];
        if (cid === -1) continue;

        const o = i * 4;
        if (bboxes[o+2] < vp.minX - margin || bboxes[o] > vp.maxX + margin ||
            bboxes[o+3] < vp.minY - margin || bboxes[o+1] > vp.maxY + margin) continue;

        const pl = level.polylines[i];
        for (let j = 0; j < pl.length - 1; j++) {
            const d = pointToSegmentDist(dataX, dataY, pl[j][0], pl[j][1], pl[j+1][0], pl[j+1][1]);
            if (d < bestDist) {
                bestDist = d;
                bestHit = { plIdx: i, chainId: cid };
            }
        }
    }
    return bestHit;
}

export function formatSkeletonTooltip(hit) {
    const meta = getChainMeta();
    const cid = String(hit.chainId);
    const info = meta ? meta[cid] : null;

    const parts = ['c' + cid];
    if (meta) {
        let cur = cid;
        for (let depth = 0; depth < 10; depth++) {
            const m = meta[cur];
            if (!m || m.parent == null) break;
            parts.push(`c${m.parent}`);
            cur = String(m.parent);
        }
    }
    parts.reverse();
    const ancestry = parts.join(' > ');

    const lines = [
        `<span class="tt-label">chain</span> <span class="tt-chain">${ancestry}</span>`,
    ];
    if (info) {
        const lengthStr = info.total_length >= 1000
            ? (info.total_length / 1000).toFixed(1) + 'kb'
            : info.total_length + 'bp';
        lines.push(`<span class="tt-label">bubbles</span> <span class="tt-val">${info.n_bubbles}</span>`);
        lines.push(`<span class="tt-label">length</span> <span class="tt-val">${lengthStr}</span>`);
    }
    return lines.join('<br>');
}
