// Detail render pipeline: culling, orchestration.

import { state } from '../../../simplify-state.js';
import { getNodeColor } from '../../../../graph/render/color/color-style.js';
import { strokePolyline, strokePolylines, fillCircles, strokeRing } from '../detail-painter.js';
import { getPolychainPositions, cumulativeLengths, interpolateAtDist } from '../../data/polychain/polychain-adapter.js';
import { getGeneChainOverlaps, extractSubPolyline } from '../../data/polychain/polychain-gene-map.js';
import { placeGenesFromDetail, blendGenePinsToSpine } from '@simplify-data/gene-data.js';
import { fetchBubbleMeta, getBubbleMeta, hasBubbleMeta, setBubblePositions, bubbleGridThreshold } from '../../data/bubble-meta-cache.js';

function getVisibleChainPolylinesByColor(chains) {
    const byColor = new Map();
    for (const chain of chains) {
        if (chain.polyline.length < 2) continue;
        const live = getPolychainPositions(chain.id);
        const pl = live || chain.polyline;
        const color = getNodeColor(chain);
        if (!byColor.has(color)) byColor.set(color, []);
        byColor.get(color).push(pl);
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

/**
 * Ensure bubble metadata is fetched for all visible chains.
 * Also computes and caches bubble [x,y] positions each frame
 * so hit-testing can use exact rendered positions.
 */
function ensureBubbleMetaFetched(chains, chr) {
    for (const chain of chains) {
        if (chain.polyline.length < 2) continue;
        if (!hasBubbleMeta(chain.id)) {
            fetchBubbleMeta(chain.id, chr);
            continue;
        }
        // Compute and cache positions for hit-testing
        const bubbles = getBubbleMeta(chain.id);
        if (!bubbles || bubbles.length === 0) continue;
        const live = getPolychainPositions(chain.id);
        const pl = live || chain.polyline;
        const cumLen = cumulativeLengths(pl);
        const totalLen = cumLen[cumLen.length - 1];
        if (totalLen === 0) continue;
        const positions = [];
        for (const meta of bubbles) {
            const [x, y] = interpolateAtDist(pl, cumLen, meta.t * totalLen);
            positions.push({ x, y, meta });
        }
        setBubblePositions(chain.id, positions);
    }
}

// Fade range: bubble fades in over this gridSize range below its threshold.
// 15 ensures even the smallest bubbles (threshold 20) are fully opaque by gridSize 5.
const BUBBLE_FADE_RANGE = 15;

/**
 * Compute bubble circles for all chains with cached metadata.
 * Each bubble's visibility is proportional to its bp length,
 * with a per-bubble fade-in as zoom crosses its threshold.
 * Returns Map<color, Array<{x, y, r, alpha}>>.
 */
function computeBubbleCirclesByColor(chains, r, gridSize) {
    const byColor = new Map();
    for (const chain of chains) {
        if (chain.polyline.length < 2) continue;

        const bubbles = getBubbleMeta(chain.id);
        if (!bubbles || bubbles.length === 0) continue;

        const live = getPolychainPositions(chain.id);
        const pl = live || chain.polyline;
        const cumLen = cumulativeLengths(pl);
        const totalLen = cumLen[cumLen.length - 1];
        if (totalLen === 0) continue;

        for (const meta of bubbles) {
            const thresh = bubbleGridThreshold(meta.length);
            if (gridSize > thresh) continue;

            // Fade in: 0 at threshold, 1 at threshold - BUBBLE_FADE_RANGE
            const fade = Math.min(1, (thresh - gridSize) / BUBBLE_FADE_RANGE);

            const colorObj = {
                type: 'bubble',
                size: meta.size,
                isRef: meta.is_ref,
                record: {
                    seqLength: meta.length,
                    gcCount: meta.gc_count,
                    start: meta.bp_start,
                    end: meta.bp_end,
                },
            };
            const color = getNodeColor(colorObj);
            if (!byColor.has(color)) byColor.set(color, []);

            const [x, y] = interpolateAtDist(pl, cumLen, meta.t * totalLen);
            byColor.get(color).push({ x, y, r, alpha: fade });
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

    // Ensure bubble metadata is fetched for ctrl+hover tooltips (regardless of zoom)
    ensureBubbleMetaFetched(state.detailData.chains, state.chromosome);

    // 2. Chain polylines (grouped by color style)
    const polylinesByColor = getVisibleChainPolylinesByColor(state.detailData.chains);
    for (const [color, polylines] of polylinesByColor) {
        strokePolylines(ctx, polylines, color, baseWidth, 0.75 * opacity, svg);
    }

    // 2.5. Bubble circle markers (larger bubbles appear first, smaller follow as zoom deepens)
    const gridSize = state.targetGridSize;
    if (gridSize <= state.BUBBLE_CIRCLE_GRID_THRESHOLD) {
        const bubbleR = Math.max(1.5, 3 / state.zoom);
        const circlesByColor = computeBubbleCirclesByColor(
            state.detailData.chains, bubbleR, gridSize);
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
        const live = getPolychainPositions(state.hoveredChain.id);
        const pl = live || state.hoveredChain.polyline;
        if (pl.length >= 2) {
            strokePolyline(ctx, pl, '#fff', Math.max(2.5, 5 / state.zoom), 0.3 * opacity);
        }
    }

    if (!svg) ctx.globalAlpha = 1;
}
