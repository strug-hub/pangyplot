// Detail render pipeline: culling, orchestration.

import { state } from '../../../state.js';
import { getNodeColor } from '../../../color/color-style.js';
import { strokePolyline, strokePolylines, fillCircles, strokeRing } from '../detail-painter.js';
import { extractSubPolyline } from '../../data/polychain/polychain-adapter.js';
import { placeGenesFromDetail, blendGenePinsToSpine } from '@graph-data/gene-data.js';
import { fetchBubbleMeta, getBubbleStore, hasBubbleMeta } from '../../data/bubble-meta-cache.js';
import { getAllAnnotations } from '@graph-data/custom-annotation-data.js';
import { getContainer } from '../../model/model-manager.js';
import { getBaseWidth, pcSettings } from '../../engines/forces/pc-settings.js';

function getVisibleChainPolylinesByColor(chains) {
    const byColor = new Map();
    for (const chain of chains) {
        if (chain.polyline.length < 2) continue;

        const container = getContainer(chain.id);
        if (!container) continue;

        const pls = [];
        for (const seg of container.segments) {
            const pl = seg.getPolyline();
            if (pl.length >= 2) pls.push(pl);
        }
        if (pls.length === 0) continue;

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
        const container = getContainer(chain.id);
        if (container && container.segments.length > 0) {
            // Use visible segments (excludes popped ranges)
            for (const seg of container.segments) {
                const tStart = Math.max(seg.tRange.start, clip.tStart);
                const tEnd = Math.min(seg.tRange.end, clip.tEnd);
                if (tStart >= tEnd) continue;
                const pl = container.polylineInRange(tStart, tEnd);
                if (pl.length >= 2) polylines.push(pl);
            }
        } else {
            const sub = extractSubPolyline(chain.polyline, clip.tStart, clip.tEnd);
            if (sub && sub.length >= 2) polylines.push(sub);
        }
    }
    return polylines;
}

const LABEL_FONT_SIZE = 14;
const LABEL_PX = 6;
const LABEL_PY = 3;
const LABEL_BADGE_H = LABEL_FONT_SIZE + LABEL_PY * 2;
const LABEL_FONT = `600 ${LABEL_FONT_SIZE}px 'SF Mono', Consolas, monospace`;

// Cached badge rects from last draw (screen-space), for hit-testing.
let labelBadges = [];  // [{ ann, sx, sy, left, top, width, height }]

export function getAnnotationLabelBadges() { return labelBadges; }

function computeCentroid(ann, dd) {
    let sumX = 0, sumY = 0, count = 0;
    for (const chain of dd.chains) {
        const rootId = chain.parentChain || chain.id;
        if (!ann.chainIds.has(chain.id) && !ann.chainIds.has(rootId)) continue;
        const container = getContainer(chain.id);
        if (!container) continue;
        const pls = container.segments.map(s => s.getPolyline()).filter(pl => pl.length >= 2);
        for (const pl of pls) {
            if (!pl || pl.length < 2) continue;
            for (const pt of pl) {
                sumX += pt[0];
                sumY += pt[1];
                count++;
            }
        }
    }
    if (count === 0) return null;
    return { x: sumX / count, y: sumY / count };
}

/**
 * Draw annotation name badges in screen space.
 * Call AFTER ctx.restore() so text doesn't scale with zoom.
 */
export function drawCustomAnnotationLabels(ctx) {
    const annotations = getAllAnnotations();
    labelBadges = [];
    if (annotations.length === 0) return;

    const dd = state.detailData;
    if (!dd) return;

    const opacity = state.detailOpacity;
    if (opacity <= 0) return;

    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const ann of annotations) {
        if (!ann.isVisible) continue;

        const centroid = computeCentroid(ann, dd);
        if (!centroid) continue;

        // Apply drag offset (data-space) then convert to screen
        const dx = centroid.x + ann.dragOffset.x;
        const dy = centroid.y + ann.dragOffset.y;
        const sx = dx * state.zoom + state.panX;
        const sy = dy * state.zoom + state.panY;

        const tw = ctx.measureText(ann.name).width;
        const badgeW = tw + LABEL_PX * 2;
        const badgeLeft = sx - tw / 2 - LABEL_PX;
        const badgeTop = sy - LABEL_BADGE_H - 6;

        // Cache for hit-testing
        labelBadges.push({ ann, sx, sy, left: badgeLeft, top: badgeTop, width: badgeW, height: LABEL_BADGE_H });

        ctx.globalAlpha = 0.85 * opacity;
        ctx.fillStyle = 'rgba(40, 32, 10, 0.85)';
        ctx.beginPath();
        ctx.roundRect(badgeLeft, badgeTop, badgeW, LABEL_BADGE_H, 3);
        ctx.fill();

        ctx.globalAlpha = opacity;
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.name, sx, badgeTop + LABEL_BADGE_H);
    }
    ctx.globalAlpha = 1;
}

// Fade range: bubble fades in over this gridSize range below its threshold.
const BUBBLE_FADE_RANGE_BASE = 15;

/**
 * Single-pass bubble update: fetches metadata for uncached chains (batched),
 * updates positions in-place for cached chains, and builds circle render data.
 * Returns Map<color, Array<{x, y, r, alpha}>> for visible bubbles, or null.
 */
function updateBubblesAndBuildCircles(chains, chr, r, gridSize) {
    const showCircles = gridSize <= state.BUBBLE_CIRCLE_GRID_THRESHOLD * pcSettings.dataScale;
    const byColor = showCircles ? new Map() : null;

    for (const chain of chains) {
        if (chain.polyline.length < 2) continue;

        const container = getContainer(chain.id);
        if (!container) continue;

        // Ensure metadata is fetched (async, cached after first fetch)
        if (!hasBubbleMeta(chain.id)) {
            fetchBubbleMeta(chain.id, chr);
            continue;
        }

        if (!showCircles) continue;

        const metaStore = getBubbleStore(chain.id);
        for (const seg of container.segments) {
            for (const b of seg.getBubbleCircles(metaStore)) {
                if (gridSize > b.threshold) continue;
                const fade = Math.min(1, (b.threshold - gridSize) / (BUBBLE_FADE_RANGE_BASE * pcSettings.dataScale));
                const color = getNodeColor(b.colorObj);
                if (!byColor.has(color)) byColor.set(color, []);
                byColor.get(color).push({ x: b.x, y: b.y, r, alpha: fade });
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

    const baseWidth = getBaseWidth(state.zoom, state.renderMaxBoost, state.thicknessMultiplier);

    // 1. Gene halos are now drawn by force-render-manager via SimObject.getGeneRenderables()

    // 2. Chain polylines (grouped by color style)
    const polylinesByColor = getVisibleChainPolylinesByColor(state.detailData.chains);
    for (const [color, polylines] of polylinesByColor) {
        strokePolylines(ctx, polylines, color, baseWidth, 0.75 * opacity, svg);
    }

    // 2.5. Bubble positions + circle markers (single pass, positions updated in-place)
    const gridSize = state.targetGridSize;
    const bubbleR = baseWidth;
    const circlesByColor = updateBubblesAndBuildCircles(
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
        const highlightR = Math.max(2.5, baseWidth * 1.5);
        strokeRing(ctx, hb.x, hb.y, highlightR, '#fff', Math.max(0.5, baseWidth / 6), 0.8 * opacity);
    }

    // 3. Selection highlight
    if (state.selectedChains.size > 0) {
        const selected = getSelectedPolylines();
        if (selected.length > 0) {
            strokePolylines(ctx, selected, '#FAB3AE', Math.max(2.5, baseWidth * 1.5), 0.9 * opacity, svg);
        }
    }


    // 4. Hover highlight (skip during SVG export)
    if (!svg && state.hoveredChain) {
        const hoverContainer = getContainer(state.hoveredChain.id);
        if (hoverContainer) {
            for (const seg of hoverContainer.segments) {
                const pl = seg.getPolyline();
                if (pl.length >= 2) {
                    strokePolyline(ctx, pl, '#fff', Math.max(2.5, baseWidth * 1.5), 0.3 * opacity);
                }
            }
        }
    }

    if (!svg) ctx.globalAlpha = 1;
}
