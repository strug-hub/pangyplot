// Detail render pipeline: culling, orchestration.

import { state } from '../../../simplify-state.js';
import { getNodeColor } from '../../../../graph/render/color/color-style.js';
import { strokePolyline, strokePolylines, fillCircles, strokeRing } from '../detail-painter.js';
import { getPolychainPositions, getPolychainPolylines, getVisibleSegments } from '../../data/polychain/polychain-adapter.js';
import { getGeneChainOverlaps, extractSubPolyline } from '../../data/polychain/polychain-gene-map.js';
import { placeGenesFromDetail, blendGenePinsToSpine } from '@simplify-data/gene-data.js';
import { fetchBubbleMeta, getBubbleStore, hasBubbleMeta, updateBubblePositions, updateBubblePositionsSegmented } from '../../data/bubble-meta-cache.js';

function getVisibleChainPolylinesByColor(chains) {
    const byColor = new Map();
    for (const chain of chains) {
        if (chain.polyline.length < 2) continue;
        const polylines = getPolychainPolylines(chain.id);
        // Only fall back to static polyline for chains that haven't been
        // processed into polychain nodes yet. Pop-created subchains and
        // chains whose polychain nodes were removed should not be drawn.
        if (!polylines) {
            if (chain.parentChain) continue;  // pop subchain with no live nodes — skip
            // Original backend chain not yet in polychain layer — use static polyline
        }
        const pls = polylines || [chain.polyline];
        const color = getNodeColor(chain);
        if (!byColor.has(color)) byColor.set(color, []);
        byColor.get(color).push(...pls);
    }
    return byColor;
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

        const polylines = getPolychainPolylines(chain.id);
        if (!polylines && chain.parentChain) continue;
        const pls = polylines || [chain.polyline];

        for (const gene of geneList) {
            for (const pl of pls) {
                if (!pl || pl.length < 2) continue;
                const sub = extractSubPolyline(pl, gene.tStart, gene.tEnd);
                if (!sub || sub.length < 2) continue;
                if (!byColor.has(gene.color)) byColor.set(gene.color, []);
                byColor.get(gene.color).push(sub);
            }
        }
    }

    for (const [color, polylines] of byColor) {
        strokePolylines(ctx, polylines, color, haloWidth, opacity, svg);
    }
}

// Fade range: bubble fades in over this gridSize range below its threshold.
const BUBBLE_FADE_RANGE = 15;

/**
 * Single-pass bubble update: fetches metadata for uncached chains (batched),
 * updates positions in-place for cached chains, and builds circle render data.
 * Returns Map<color, Array<{x, y, r, alpha}>> for visible bubbles, or null.
 */
function updateBubblesAndBuildCircles(chains, chr, r, gridSize) {
    const showCircles = gridSize <= state.BUBBLE_CIRCLE_GRID_THRESHOLD;
    const byColor = showCircles ? new Map() : null;

    for (const chain of chains) {
        if (chain.polyline.length < 2) continue;

        if (!hasBubbleMeta(chain.id)) {
            // Don't fetch from backend for pop-created subchains —
            // their stores are populated by splitBubbleStore
            if (chain.parentChain && !getPolychainPositions(chain.id)) continue;
            fetchBubbleMeta(chain.id, chr);
            continue;
        }

        const store = getBubbleStore(chain.id);
        if (!store || store.positions.length === 0) continue;

        // Update positions in-place from live polychain node positions.
        // Use segmented positioning if the chain has gaps (popped bubbles)
        // so circles stay on the correct side of each gap.
        const segments = getVisibleSegments(chain.id);
        if (segments && !(segments.length === 1 && segments[0].tStart === 0 && segments[0].tEnd === 1)) {
            updateBubblePositionsSegmented(chain.id, segments);
        } else {
            const live = getPolychainPositions(chain.id);
            const pl = live || chain.polyline;
            updateBubblePositions(chain.id, pl);
        }

        // Build circle render data from updated positions
        if (showCircles) {
            for (const pos of store.positions) {
                const thresh = pos.meta.threshold;
                if (gridSize > thresh) continue;
                const fade = Math.min(1, (thresh - gridSize) / BUBBLE_FADE_RANGE);
                const color = getNodeColor(pos.meta._colorObj);
                if (!byColor.has(color)) byColor.set(color, []);
                byColor.get(color).push({ x: pos.x, y: pos.y, r, alpha: fade });
            }
        }
    }
    return byColor;
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

    // 2. Chain polylines (grouped by color style)
    const polylinesByColor = getVisibleChainPolylinesByColor(state.detailData.chains);
    for (const [color, polylines] of polylinesByColor) {
        strokePolylines(ctx, polylines, color, baseWidth, 0.75 * opacity, svg);
    }

    // 2.5. Bubble positions + circle markers (single pass, positions updated in-place)
    // Hide bubbles when force vectors debug is active
    const gridSize = state.targetGridSize;
    const bubbleR = Math.max(1.5, 3 / state.zoom);
    const circlesByColor = state.forceVectors ? null : updateBubblesAndBuildCircles(
        state.detailData.chains, state.chromosome, bubbleR, gridSize);
    if (circlesByColor) {
        // Batch by (color, quantized alpha) for efficient draw calls
        const batches = new Map(); // "color|alphaStep" → { circles, color, alpha }
        for (const [color, circles] of circlesByColor) {
            for (const c of circles) {
                const a = Math.round(c.alpha * 10) / 10; // quantize to 0.1 steps
                const key = `${color}|${a}`;
                if (!batches.has(key)) batches.set(key, { circles: [], color, alpha: a });
                batches.get(key).circles.push(c);
            }
        }
        for (const { circles, color, alpha } of batches.values()) {
            fillCircles(ctx, circles, color, alpha * opacity, svg);
        }
    }

    // 2.6. Hovered bubble circle highlight (ctrl+hover)
    if (!svg && state.hoveredBubbleCircle) {
        const hb = state.hoveredBubbleCircle;
        const highlightR = Math.max(2.5, 5 / state.zoom);
        strokeRing(ctx, hb.x, hb.y, highlightR, '#fff', Math.max(0.5, 1 / state.zoom), 0.8 * opacity);
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
        const polylines = getPolychainPolylines(state.hoveredChain.id);
        const pls = polylines || [state.hoveredChain.polyline];
        for (const pl of pls) {
            if (pl.length >= 2) {
                strokePolyline(ctx, pl, '#fff', Math.max(2.5, 5 / state.zoom), 0.3 * opacity);
            }
        }
    }

    if (!svg) ctx.globalAlpha = 1;
}
