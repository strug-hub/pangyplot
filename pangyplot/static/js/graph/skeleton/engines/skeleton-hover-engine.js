// Skeleton polyline hover detection and tooltip formatting.

import { state } from '../../state.js';
import { getViewport } from '../../render/viewport.js';
import { getLevel, getLevelBboxes } from '../data/skeleton-data.js';
import { getChainMeta } from '@graph-data/chromosome-data.js';
import { pointToSegmentDist } from '../../utils/geometry.js';
const SKELETON_HIT_RADIUS_PX = 14;

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

export function getSkeletonTooltip(hit) {
    const meta = getChainMeta();
    const cid = String(hit.chainId);
    const info = meta ? meta[cid] : null;

    const parts = ['c' + cid];
    if (meta) {
        let cur = cid;
        for (let depth = 0; depth < 10; depth++) {
            const m = meta[cur];
            if (!m || m.parent == null) break;
            if (m.parent_bubble != null) {
                parts.push(`b${m.parent_bubble}`);
            }
            parts.push(`c${m.parent}`);
            cur = String(m.parent);
        }
    }
    parts.reverse();

    const data = { chain: parts.join(' > ') };
    if (info) {
        data.bubbles = info.n_bubbles;
        data.length = info.total_length;
    }
    return data;
}
