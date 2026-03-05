// Detail layer rendering: chain polylines, junction nodes/links, selections, hovers.

import { state } from '../../simplify-state.js';
import { drawForceGraph } from './force-painter.js';

function drawChainPolylines(chains, baseWidth, hovChain) {
    const ctx = state.ctx;
    for (const chain of chains) {
        // Skip popped chains — replaced by force graph
        if (state.poppedChainIds.size > 0 && state.poppedChainIds.has(chain.id)) continue;
        const pl = chain.polyline;
        if (pl.length < 2) continue;
        const isHovered = hovChain && chain === hovChain;

        // All chains (including connectors) use uniform skeleton-matched style
        ctx.setLineDash([]);
        ctx.strokeStyle = isHovered ? '#FAB3AE' : '#FF6700';
        ctx.lineWidth = isHovered ? baseWidth * 1.5 : baseWidth;
        if (hovChain && !isHovered) {
            ctx.globalAlpha = 0.25 * state.detailOpacity;
        } else if (isHovered) {
            ctx.globalAlpha = state.detailOpacity;
        } else {
            ctx.globalAlpha = 0.75 * state.detailOpacity;
        }

        ctx.beginPath();
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) {
            ctx.lineTo(pl[i][0], pl[i][1]);
        }
        ctx.stroke();

        if (hovChain) {
            ctx.globalAlpha = state.detailOpacity;
        }
    }
}

export function drawDetail() {
    const ctx = state.ctx;
    ctx.globalAlpha = state.detailOpacity;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const hovChain = state.hoveredChain;

    // --- Build set of activated junction coordinates to skip in static rendering ---
    let activatedCoords = null;
    if (state.activatedJunctionSegs.size > 0 && state.detailData.junctionGraph) {
        activatedCoords = new Set();
        for (const node of state.detailData.junctionGraph.nodes) {
            const segId = node.id || `s${node.segment_id}`;
            if (state.activatedJunctionSegs.has(segId)) {
                // Use rounded centroid as coordinate key
                const cx = Math.round(((node.x1 || 0) + (node.x2 || 0)) / 2 * 10) / 10;
                const cy = Math.round(((node.y1 || 0) + (node.y2 || 0)) / 2 * 10) / 10;
                activatedCoords.add(`${cx},${cy}`);
            }
        }
    }

    // --- Junction links (GFA edges between naked segments / chain endpoints) ---
    if (!state.hideChainOverlay && state.detailData.junctionLinks && state.detailData.junctionLinks.length > 0) {
        ctx.strokeStyle = '#999';
        ctx.lineWidth = Math.max(0.8, 1.8 / state.zoom);
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.7 * state.detailOpacity;
        ctx.beginPath();
        for (const link of state.detailData.junctionLinks) {
            // Skip links where either endpoint is an activated junction
            if (activatedCoords) {
                const k0 = `${link[0][0]},${link[0][1]}`;
                const k1 = `${link[1][0]},${link[1][1]}`;
                if (activatedCoords.has(k0) || activatedCoords.has(k1)) continue;
            }
            ctx.moveTo(link[0][0], link[0][1]);
            ctx.lineTo(link[1][0], link[1][1]);
        }
        ctx.stroke();
        ctx.globalAlpha = state.detailOpacity;
    }

    // --- Junction nodes (naked segment dots between chains) ---
    if (!state.hideChainOverlay && state.detailData.junctionNodes && state.detailData.junctionNodes.length > 0) {
        const r = Math.max(0.8, 1.5 / state.zoom);
        ctx.fillStyle = '#999';
        ctx.globalAlpha = 0.5 * state.detailOpacity;
        ctx.beginPath();
        for (const [x, y] of state.detailData.junctionNodes) {
            // Skip nodes that are activated in the force simulation
            if (activatedCoords && activatedCoords.has(`${x},${y}`)) continue;
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.globalAlpha = state.detailOpacity;
    }

    // --- Chain polylines ---
    const baseWidth = Math.max(1.5, 3 / state.zoom);
    if (!state.hideChainOverlay) {
        drawChainPolylines(state.detailData.chains, baseWidth, hovChain);
    }

    // --- Force graph (seed chain) ---
    drawForceGraph(ctx, baseWidth);

    // --- Gap-fillers: dashed connectors between GFA-adjacent sibling chains ---
    if (!state.hideChainOverlay && state.detailData.siblingConnectors && state.detailData.siblingConnectors.length > 0) {
        const dash = Math.max(2, 4 / state.zoom);
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = Math.max(0.8, 1.8 / state.zoom);
        ctx.setLineDash([dash, dash]);
        ctx.globalAlpha = 0.5 * state.detailOpacity;
        ctx.beginPath();
        for (const link of state.detailData.siblingConnectors) {
            ctx.moveTo(link[0][0], link[0][1]);
            for (let i = 1; i < link.length; i++) {
                ctx.lineTo(link[i][0], link[i][1]);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // --- Selection highlight ---
    if (state.selectedChains.size > 0) {
        ctx.strokeStyle = '#FAB3AE';
        ctx.lineWidth = Math.max(2.5, 5 / state.zoom);
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.9 * state.detailOpacity;
        ctx.beginPath();
        for (const chain of state.selectedChains) {
            if (state.poppedChainIds.size > 0 && state.poppedChainIds.has(chain.id)) continue;
            const pl = chain.polyline;
            if (pl.length < 2) continue;
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let i = 1; i < pl.length; i++) {
                ctx.lineTo(pl[i][0], pl[i][1]);
            }
        }
        ctx.stroke();
        ctx.globalAlpha = state.detailOpacity;
    }

    // --- Hover highlight ---
    if (state.hoveredChain) {
        const hc = state.hoveredChain;
        const pl = hc.polyline;

        if (pl.length >= 2) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = Math.max(2.5, 5 / state.zoom);
            ctx.globalAlpha = 0.3 * state.detailOpacity;
            ctx.beginPath();
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let i = 1; i < pl.length; i++) {
                ctx.lineTo(pl[i][0], pl[i][1]);
            }
            ctx.stroke();
            ctx.globalAlpha = state.detailOpacity;
        }
    }

    ctx.globalAlpha = 1;
}
