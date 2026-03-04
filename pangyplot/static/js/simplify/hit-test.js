// Chain/bubble/skeleton hover detection and tooltip formatting.

import { state } from './simplify-state.js';
import { subtypeColor, formatBp } from './format-utils.js';
import { selectLevel } from './lod.js';
import { getViewport } from './viewport.js';
import { getForceNodes } from './simplify-force.js';

const HIT_RADIUS_PX = 12;
const SKELETON_HIT_RADIUS_PX = 14;

function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTestBubbles(dataX, dataY) {
    if (!state.detailData || !state.detailData.bubbles || state.detailOpacity < 0.5) return null;
    const margin = HIT_RADIUS_PX / state.zoom;
    for (const b of state.detailData.bubbles) {
        // Ellipse containment with hover margin
        const dx = (dataX - b.x) / (b.rx + margin);
        const dy = (dataY - b.y) / (b.ry + margin);
        if (dx * dx + dy * dy <= 1) return b;
    }
    return null;
}

export function hitTestForceNodes(dataX, dataY) {
    if (state.detailOpacity < 0.5) return null;
    const nodes = getForceNodes();
    if (nodes.length === 0) return null;

    const hitR = HIT_RADIUS_PX / state.zoom;
    let bestDist = hitR;
    let bestNode = null;

    for (const node of nodes) {
        const dx = dataX - node.x;
        const dy = dataY - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Hit within the node's visual radius or the minimum hit radius
        const nodeR = (node.width || 6) / (2 * state.zoom);
        const threshold = Math.max(nodeR, hitR);
        if (dist < threshold && dist < bestDist) {
            bestDist = dist;
            bestNode = node;
        }
    }
    return bestNode;
}

export function formatForceNodeTooltip(node) {
    const typeColors = { segment: '#0762E5', bubble: '#F2DC0F', chain: '#FF6700' };
    const color = typeColors[node.type] || '#888';
    const lengthStr = node.seqLength >= 1000
        ? (node.seqLength / 1000).toFixed(1) + 'kb'
        : node.seqLength + 'bp';
    const displayId = node.recordId || node.id;
    const lines = [
        `<span class="tt-label">${node.type}</span> <span class="tt-chain">${displayId}</span>`,
        `<span class="tt-label">length</span> <span class="tt-val">${lengthStr}</span>`,
        `<span class="tt-label">chain</span> <span class="tt-val" style="color:${color}">${node.chainId}</span>`,
    ];
    return lines.join('<br>');
}

/**
 * Return all detail chains whose polyline has at least one vertex inside the given
 * data-space rectangle, or whose polyline segment crosses the rectangle boundary.
 * For practical purposes vertex-in-box is sufficient since polylines have dense points.
 */
export function chainsInRect(minX, minY, maxX, maxY) {
    if (!state.detailData) return [];
    const result = [];
    for (const chain of state.detailData.chains) {
        if (state.poppedChainIds && state.poppedChainIds.has(chain.id)) continue;
        const pl = chain.polyline;
        if (!pl || pl.length === 0) continue;

        // Fast AABB reject: compute polyline bbox
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

        // Check if any vertex falls inside the rect
        let hit = false;
        for (let i = 0; i < pl.length; i++) {
            const x = pl[i][0], y = pl[i][1];
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                hit = true;
                break;
            }
        }
        if (!hit) {
            // Check if any segment crosses the rect boundary
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

/** Check if line segment (ax,ay)-(bx,by) intersects axis-aligned rect */
function segmentIntersectsRect(ax, ay, bx, by, minX, minY, maxX, maxY) {
    // Cohen-Sutherland-style: if both endpoints on same side, no intersection
    // Otherwise just check if segment crosses any rect edge
    const dx = bx - ax, dy = by - ay;

    // Check against each edge using parametric t
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

export function formatTooltip(chain) {
    const subtypeColors = { simple: '#4a90d9', superbubble: '#d94a90' };
    const color = subtypeColors[chain.subtype] || '#90d94a';
    const lengthStr = chain.length >= 1000 ? (chain.length/1000).toFixed(1) + 'kb' : chain.length + 'bp';
    const typeLabel = `<span class="tt-subtype" style="color:${color}">${chain.subtype}</span>`;

    // Build ancestry string e.g. "c5 > c122 > c122_r1" (root → leaf)
    const parts = [chain.id];
    let cur = chain.parentChain;
    while (cur) {
        parts.push(cur);
        const numId = cur.startsWith('c') ? cur.slice(1) : cur;
        const meta = state.data.chainMeta?.[numId];
        cur = meta?.parent != null ? `c${meta.parent}` : null;
    }
    parts.reverse();
    const ancestry = parts.join(' > ');

    const lines = [
        `<span class="tt-label">chain</span> <span class="tt-chain">${ancestry}</span>`,
        `<span class="tt-label">type</span> ${typeLabel}`,
        `<span class="tt-label">length</span> <span class="tt-val">${lengthStr}</span>`,
        `<span class="tt-label">bubbles</span> <span class="tt-val">${chain.nBubbles}</span>`,
        `<span class="tt-label">polyline</span> <span class="tt-val">${chain.polyline.length} pts</span>`,
        `<span class="tt-label">depth</span> <span class="tt-val">${chain.depth}</span>`,
    ];
    return lines.join('<br>');
}

export function formatBubbleTooltip(b) {
    const color = subtypeColor(b.subtype);
    const lengthStr = b.length >= 1000 ? (b.length/1000).toFixed(1) + 'kb' : b.length + 'bp';
    const typeLabel = `<span class="tt-subtype" style="color:${color}">${b.subtype}</span>`;
    const lines = [
        `<span class="tt-label">bubble</span> <span class="tt-chain">${b.id}</span>`,
        `<span class="tt-label">type</span> ${typeLabel}`,
        `<span class="tt-label">length</span> <span class="tt-val">${lengthStr}</span>`,
        `<span class="tt-label">chain</span> <span class="tt-val">${b.chain}</span>`,
    ];
    return lines.join('<br>');
}

export function hitTestSkeleton(dataX, dataY) {
    if (!state.data) return null;
    const li = selectLevel();
    const level = state.data.levels[li];
    if (!level || !level.chainIds) return null;

    const hitR = SKELETON_HIT_RADIUS_PX / state.zoom;
    const bboxes = state.levelBboxes[li];
    const vp = getViewport();
    const margin = (level.cellSize || 50) * 2;

    let bestDist = hitR;
    let bestHit = null;

    for (let i = 0; i < level.polylines.length; i++) {
        const cid = level.chainIds[i];
        if (cid === -1) continue;

        // Bbox cull
        const o = i * 4;
        if (bboxes[o+2] < vp.minX - margin || bboxes[o] > vp.maxX + margin ||
            bboxes[o+3] < vp.minY - margin || bboxes[o+1] > vp.maxY + margin) continue;

        const pl = level.polylines[i];
        for (let j = 0; j < pl.length - 1; j++) {
            const d = pointToSegmentDist(dataX, dataY, pl[j][0], pl[j][1], pl[j+1][0], pl[j+1][1]);
            if (d < bestDist) {
                bestDist = d;
                bestHit = { levelIdx: li, plIdx: i, chainId: cid };
            }
        }
    }
    return bestHit;
}

export function formatSkeletonTooltip(hit) {
    const meta = state.data.chainMeta;
    const cid = String(hit.chainId);
    const info = meta ? meta[cid] : null;

    // Build ancestry string (e.g. "c1 > c122 > c489") (root → leaf)
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
