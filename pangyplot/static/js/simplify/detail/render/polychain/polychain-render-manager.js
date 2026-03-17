// Detail render pipeline: culling, orchestration.

import { state } from '../../../simplify-state.js';
import { strokeLines, strokePolyline, strokePolylines } from '../detail-painter.js';
import { buildSegToChains } from '../../data/polychain/polychain-adapter.js';

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

    // 1. Junction links — skip any where both endpoint segments' chains are all popped
    if (!state.hideChainOverlay && state.detailData.junctionLinks?.length > 0) {
        const dd = state.detailData;
        if (!dd._segToChains) {
            dd._segToChains = buildSegToChains(dd.junctionSegChains || {}, dd.chains);
        }
        const segToChains = dd._segToChains;
        const popped = state.poppedChainIds;
        const jlCoords = [];
        for (const jl of state.detailData.junctionLinks) {
            if (popped.size > 0) {
                const chainsA = segToChains[`s${jl.segs[0]}`] || [];
                const chainsB = segToChains[`s${jl.segs[1]}`] || [];
                if (chainsA.length > 0 && chainsB.length > 0 &&
                    chainsA.every(c => popped.has(c)) &&
                    chainsB.every(c => popped.has(c))) {
                    continue; // both ends fully popped — junction nodes replace this line
                }
            }
            jlCoords.push(jl.coords);
        }
        if (jlCoords.length > 0) {
            strokeLines(ctx, jlCoords, '#999', lineWidth, 0.7 * opacity);
        }
    }

    // 2. Junction segments — disabled (junction links show the topology;
    //    segment geometries are visual clutter from ODGI layout coords)

    // 3. Chain polylines
    if (!state.hideChainOverlay) {
        const visible = getVisibleChainPolylines(state.detailData.chains);

        if (visible.length > 0) {
            strokePolylines(ctx, visible, '#FF6700', baseWidth, 0.75 * opacity);
        }
    }

    // 4. Selection highlight
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
