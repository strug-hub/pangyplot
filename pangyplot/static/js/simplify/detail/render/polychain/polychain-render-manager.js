// Detail render pipeline: culling, orchestration.

import { state } from '../../../simplify-state.js';
import { strokeLines, strokeSegments, strokePolyline, strokePolylines, strokeDashedPolylines } from '../detail-painter.js';

function getVisibleChainPolylines(chains) {
    const base = [];
    for (const chain of chains) {
        if (state.poppedChainIds.size > 0 && state.poppedChainIds.has(chain.id)) continue;
        if (chain.polyline.length < 2) continue;
        base.push(chain.polyline);
    }
    return base;
}

function getSelectedPolylines() {
    const polylines = [];
    for (const chain of state.selectedChains) {
        if (state.poppedChainIds.size > 0 && state.poppedChainIds.has(chain.id)) continue;
        if (chain.polyline.length < 2) continue;
        polylines.push(chain.polyline);
    }
    return polylines;
}

export function drawDetail() {
    const ctx = state.ctx;
    const opacity = state.detailOpacity;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const baseWidth = Math.max(1.5, 3 / state.zoom);
    const lineWidth = Math.max(0.8, 1.8 / state.zoom);

    // 1. Junction links
    if (!state.hideChainOverlay && state.detailData.junctionLinks?.length > 0) {
        strokeLines(ctx, state.detailData.junctionLinks, '#999', lineWidth, 0.7 * opacity);
    }

    // 2. Junction segments (rendered as segment lines)
    const jgNodes = state.detailData.junctionGraph?.nodes;
    if (!state.hideChainOverlay && jgNodes?.length > 0) {
        strokeSegments(ctx, jgNodes, '#999', lineWidth, 0.6 * opacity);
    }

    // 3. Chain polylines
    if (!state.hideChainOverlay) {
        const visible = getVisibleChainPolylines(state.detailData.chains);

        if (visible.length > 0) {
            strokePolylines(ctx, visible, '#FF6700', baseWidth, 0.75 * opacity);
        }
    }

    // 4. Sibling connectors
    if (!state.hideChainOverlay && state.detailData.siblingConnectors?.length > 0) {
        const dash = Math.max(2, 4 / state.zoom);
        strokeDashedPolylines(ctx, state.detailData.siblingConnectors, '#aaa',
            Math.max(0.8, 1.8 / state.zoom), 0.5 * opacity, dash);
    }

    // 5. Selection highlight
    if (state.selectedChains.size > 0) {
        const selected = getSelectedPolylines();
        if (selected.length > 0) {
            strokePolylines(ctx, selected, '#FAB3AE', Math.max(2.5, 5 / state.zoom), 0.9 * opacity);
        }
    }

    // 6. Hover highlight
    if (state.hoveredChain) {
        const pl = state.hoveredChain.polyline;
        if (pl.length >= 2) {
            strokePolyline(ctx, pl, '#fff', Math.max(2.5, 5 / state.zoom), 0.3 * opacity);
        }
    }

    ctx.globalAlpha = 1;
}
