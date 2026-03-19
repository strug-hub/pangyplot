// Detail render pipeline: culling, orchestration.

import { state } from '../../../simplify-state.js';
import { colorState } from '../../../../graph/render/color/color-state.js';
import { strokePolyline, strokePolylines } from '../detail-painter.js';
import { getPolychainPositions } from '../../data/polychain/polychain-adapter.js';
import { getGeneChainOverlaps, extractSubPolyline } from '../../data/polychain/polychain-gene-map.js';
import { placeGenesFromDetail, blendGenePinsToSpine } from '../../../skeleton/data/gene-data.js';

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
    for (const [chain, clip] of state.selectedChains) {
        if (chain.polyline.length < 2) continue;
        const live = getPolychainPositions(chain.id);
        const pl = live || chain.polyline;
        const sub = extractSubPolyline(pl, clip.tStart, clip.tEnd);
        if (sub && sub.length >= 2) polylines.push(sub);
    }
    return polylines;
}

function drawGeneOverlays(ctx, opacity, baseWidth, svg = null) {
    const overlaps = getGeneChainOverlaps();
    if (overlaps.size === 0) return;

    const dd = state.detailData;
    if (!dd) return;

    // Halo: thicker than chain line, drawn behind it
    const haloWidth = Math.max(4, 10 / state.zoom);
    if (!svg) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
    }

    // Batch by color to minimize state changes
    const byColor = new Map();
    for (const chain of dd.chains) {
        const geneList = overlaps.get(chain.id);
        if (!geneList) continue;

        const pl = getPolychainPositions(chain.id) || chain.polyline;
        if (!pl || pl.length < 2) continue;

        for (const gene of geneList) {
            const sub = extractSubPolyline(pl, gene.tStart, gene.tEnd);
            if (!sub || sub.length < 2) continue;
            if (!byColor.has(gene.color)) byColor.set(gene.color, []);
            byColor.get(gene.color).push(sub);
        }
    }

    for (const [color, polylines] of byColor) {
        strokePolylines(ctx, polylines, color, haloWidth, opacity, svg);
    }
}

let _lastPlaceGenes = 0;

export function drawDetail(svg = null) {
    // Reposition skeleton gene pins from detail chain data
    // Every frame during fade-in so pins track moving chains,
    // blend toward spine during fade-out for smooth transition,
    // throttled to 500ms once detail is fully static
    if (!svg) {
        const now = Date.now();
        if (state.detailPhase === 'fading-in') {
            placeGenesFromDetail(state.detailData.chains);
            _lastPlaceGenes = now;
        } else if (state.detailPhase === 'fading-out') {
            const t = 1 - state.detailOpacity; // 0 at start of fade-out, 1 at end
            blendGenePinsToSpine(t);
            _lastPlaceGenes = now;
        } else if (now - _lastPlaceGenes > 500) {
            _lastPlaceGenes = now;
            placeGenesFromDetail(state.detailData.chains);
        }
    }

    const ctx = state.ctx;
    const opacity = state.detailOpacity;
    if (!svg) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
    }

    const baseWidth = Math.max(1.5, 3 / state.zoom);

    // 1. Gene halo outlines (drawn BEHIND chain polylines, like core viewer)
    drawGeneOverlays(ctx, opacity, baseWidth, svg);

    // 2. Chain polylines
    const visible = getVisibleChainPolylines(state.detailData.chains);

    if (visible.length > 0) {
        strokePolylines(ctx, visible, colorState.nodeColors[2], baseWidth, 0.75 * opacity, svg);
    }

    // 3. Selection highlight
    if (state.selectedChains.size > 0) {
        const selected = getSelectedPolylines();
        if (selected.length > 0) {
            strokePolylines(ctx, selected, '#FAB3AE', Math.max(2.5, 5 / state.zoom), 0.9 * opacity, svg);
        }
    }

    // 4. Hover highlight (skip during SVG export)
    if (!svg && state.hoveredChain) {
        const live = getPolychainPositions(state.hoveredChain.id);
        const pl = live || state.hoveredChain.polyline;
        if (pl.length >= 2) {
            strokePolyline(ctx, pl, '#fff', Math.max(2.5, 5 / state.zoom), 0.3 * opacity);
        }
    }

    if (!svg) ctx.globalAlpha = 1;
}
