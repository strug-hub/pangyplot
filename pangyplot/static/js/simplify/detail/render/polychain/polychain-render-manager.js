// Detail render pipeline: culling, orchestration.

import { state } from '../../../simplify-state.js';
import { strokePolyline, strokePolylines } from '../detail-painter.js';
import { getPolychainPositions } from '../../data/polychain/polychain-adapter.js';

function getVisibleChainPolylines(chains) {
    const base = [];
    for (const chain of chains) {
        if (chain.polyline.length < 2) continue;
        // Read live positions from force sim polychain nodes, fall back to static
        const live = getPolychainPositions(chain.id);
        base.push(live || chain.polyline);
    }
    return base;
}

function getSelectedPolylines() {
    const polylines = [];
    for (const chain of state.selectedChains) {
        if (chain.polyline.length < 2) continue;
        const live = getPolychainPositions(chain.id);
        polylines.push(live || chain.polyline);
    }
    return polylines;
}

export function drawDetail() {
    const ctx = state.ctx;
    const opacity = state.detailOpacity;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const baseWidth = Math.max(1.5, 3 / state.zoom);

    // 1. Chain polylines
    if (!state.hideChainOverlay) {
        const visible = getVisibleChainPolylines(state.detailData.chains);

        if (visible.length > 0) {
            strokePolylines(ctx, visible, '#FF6700', baseWidth, 0.75 * opacity);
        }
    }

    // 2. Selection highlight
    if (state.selectedChains.size > 0) {
        const selected = getSelectedPolylines();
        if (selected.length > 0) {
            strokePolylines(ctx, selected, '#FAB3AE', Math.max(2.5, 5 / state.zoom), 0.9 * opacity);
        }
    }

    // 3. Hover highlight
    if (state.hoveredChain) {
        const live = getPolychainPositions(state.hoveredChain.id);
        const pl = live || state.hoveredChain.polyline;
        if (pl.length >= 2) {
            strokePolyline(ctx, pl, '#fff', Math.max(2.5, 5 / state.zoom), 0.3 * opacity);
        }
    }

    ctx.globalAlpha = 1;
}
