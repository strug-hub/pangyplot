// Chain/bubble hover detection and tooltip formatting.

import { state } from './simplify-state.js';
import { subtypeColor } from './format-utils.js';

const HIT_RADIUS_PX = 12;

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
    const lines = [
        `<span class="tt-label">chain</span> <span class="tt-chain">${chain.id}</span>`,
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
