// Detail render pipeline: culling, orchestration.

import { state } from '../../../simplify-state.js';
import { strokeLines, fillDots, strokePolyline, strokePolylines, strokeDashedPolylines } from '../detail-painter.js';
import { drawForceGraph } from '../force-render-manager.js';

/**
 * Build a set of coordinate keys for junction segments that are
 * currently activated in the force simulation (to skip in static rendering).
 */
function buildActivatedCoords() {
    if (state.activatedJunctionSegs.size === 0 || !state.detailData.junctionGraph) return null;
    const coords = new Set();
    for (const node of state.detailData.junctionGraph.nodes) {
        const segId = node.id || `s${node.segment_id}`;
        if (state.activatedJunctionSegs.has(segId)) {
            const cx = Math.round(((node.x1 || 0) + (node.x2 || 0)) / 2 * 10) / 10;
            const cy = Math.round(((node.y1 || 0) + (node.y2 || 0)) / 2 * 10) / 10;
            coords.add(`${cx},${cy}`);
        }
    }
    return coords;
}

function filterJunctionLinks(links, activatedCoords) {
    if (!activatedCoords) return links;
    return links.filter(link => {
        const k0 = `${link[0][0]},${link[0][1]}`;
        const k1 = `${link[1][0]},${link[1][1]}`;
        return !activatedCoords.has(k0) && !activatedCoords.has(k1);
    });
}

function filterJunctionNodes(nodes, activatedCoords) {
    if (!activatedCoords) return nodes;
    return nodes.filter(([x, y]) => !activatedCoords.has(`${x},${y}`));
}

function getVisibleChainPolylines(chains, hovChain) {
    const base = [];
    const dimmed = [];
    let hovered = null;

    for (const chain of chains) {
        if (state.poppedChainIds.size > 0 && state.poppedChainIds.has(chain.id)) continue;
        if (chain.polyline.length < 2) continue;

        if (hovChain && chain === hovChain) {
            hovered = chain.polyline;
        } else if (hovChain) {
            dimmed.push(chain.polyline);
        } else {
            base.push(chain.polyline);
        }
    }
    return { base, dimmed, hovered };
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

    const activatedCoords = buildActivatedCoords();
    const baseWidth = Math.max(1.5, 3 / state.zoom);

    // 1. Junction links
    if (!state.hideChainOverlay && state.detailData.junctionLinks?.length > 0) {
        const links = filterJunctionLinks(state.detailData.junctionLinks, activatedCoords);
        if (links.length > 0) {
            strokeLines(ctx, links, '#999', Math.max(0.8, 1.8 / state.zoom), 0.7 * opacity);
        }
    }

    // 2. Junction nodes
    if (!state.hideChainOverlay && state.detailData.junctionNodes?.length > 0) {
        const nodes = filterJunctionNodes(state.detailData.junctionNodes, activatedCoords);
        if (nodes.length > 0) {
            fillDots(ctx, nodes, Math.max(0.8, 1.5 / state.zoom), '#999', 0.5 * opacity);
        }
    }

    // 3. Chain polylines
    if (!state.hideChainOverlay) {
        const { base, dimmed, hovered } = getVisibleChainPolylines(state.detailData.chains, state.hoveredChain);

        if (base.length > 0) {
            strokePolylines(ctx, base, '#FF6700', baseWidth, 0.75 * opacity);
        }
        if (dimmed.length > 0) {
            strokePolylines(ctx, dimmed, '#FF6700', baseWidth, 0.25 * opacity);
        }
        if (hovered) {
            strokePolyline(ctx, hovered, '#FAB3AE', baseWidth * 1.5, opacity);
        }
    }

    // 4. Force graph
    drawForceGraph(ctx, baseWidth);

    // 5. Sibling connectors
    if (!state.hideChainOverlay && state.detailData.siblingConnectors?.length > 0) {
        const dash = Math.max(2, 4 / state.zoom);
        strokeDashedPolylines(ctx, state.detailData.siblingConnectors, '#aaa',
            Math.max(0.8, 1.8 / state.zoom), 0.5 * opacity, dash);
    }

    // 6. Selection highlight
    if (state.selectedChains.size > 0) {
        const selected = getSelectedPolylines();
        if (selected.length > 0) {
            strokePolylines(ctx, selected, '#FAB3AE', Math.max(2.5, 5 / state.zoom), 0.9 * opacity);
        }
    }

    // 7. Hover highlight
    if (state.hoveredChain) {
        const pl = state.hoveredChain.polyline;
        if (pl.length >= 2) {
            strokePolyline(ctx, pl, '#fff', Math.max(2.5, 5 / state.zoom), 0.3 * opacity);
        }
    }

    ctx.globalAlpha = 1;
}
