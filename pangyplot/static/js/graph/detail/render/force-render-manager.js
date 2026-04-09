// Force graph render manager: categorizes nodes/links, delegates to detail-painter.

import { state } from '../../state.js';
import { getForceNodes, getForceLinks } from '../data/force-data.js';
import { fillCircles, strokeSegments } from './detail-painter.js';
import { drawRotatedCross } from '../../render/painter-utils.js';
import { drawSelectionHighlight, drawHoverHighlight } from './highlight-painter.js';
import { pcSettings, chargeStr } from '../engines/force-engine.js';
import { getContainer, collectGeneRenderables } from '../model/model-manager.js';
import { resolve as resolveSegment } from '../model/segment-registry.js';
import { isGeneVisible } from '@graph-data/gene-data.js';
import { mixGeneColor } from '../model/sim-object.js';
import { getNodeColor } from '../../color/color-style.js';
import { colorState } from '../../color/color-state.js';
import { bubbleGridThreshold } from '../data/bubble-meta-cache.js';

/** Last-frame rendered junction counts (read by status-bar). */
export let renderedJunctionNodes = 0;
export let renderedJunctionLinks = 0;

const SELECTION_COLOR = '#FAB3AE';

function nodeColorForSelection(node) {
    if (state.selectedObjects.size > 0 && node.simObject &&
        state.selectedObjects.has(node.simObject)) {
        return SELECTION_COLOR;
    }
    return getNodeColor(node);
}

export function drawForceGraph(ctx, baseWidth, svg = null, vp = null) {
    const nodes = getForceNodes();
    const links = getForceLinks();
    if (nodes.length === 0) return;

    // Use baseWidth (from polychain-render-manager) so naked nodes match polychain size
    const scaleFactor = baseWidth;   // passed to highlight helpers
    const opacity = state.detailOpacity;

    if (!svg) ctx.lineCap = 'round';

    // Viewport culling helpers
    const cull = vp != null;
    function linkVisible(s, t) {
        if (!cull) return true;
        // Visible if either endpoint is inside viewport
        return (s.x >= vp.minX && s.x <= vp.maxX && s.y >= vp.minY && s.y <= vp.maxY) ||
               (t.x >= vp.minX && t.x <= vp.maxX && t.y >= vp.minY && t.y <= vp.maxY);
    }
    function nodeVisible(x, y) {
        if (!cull) return true;
        return x >= vp.minX && x <= vp.maxX && y >= vp.minY && y <= vp.maxY;
    }

    const gridSize = state.targetGridSize;

    // --- Categorize links ---
    const kinkByColor = new Map();
    const chainSegs = [];
    const junctionSegs = [];
    const delSegs = [];

    for (const link of links) {
        if (link.isPolychainLink || link.isSpineLink) continue;  // spine infrastructure, not drawn
        const s = link.source, t = link.target;
        if (s.x == null || t.x == null) continue;
        if (!linkVisible(s, t)) continue;
        // Skip drawing links to hidden backbone nodes (physics-only)
        // Spine-internal links already skipped above (isPolychainLink check).
        const seg = { x1: s.x, y1: s.y, x2: t.x, y2: t.y };

        if (link.isDel) {
            delSegs.push(seg);
        } else if (link.isKinkLink) {
            const color = nodeColorForSelection(s);
            if (!kinkByColor.has(color)) kinkByColor.set(color, []);
            kinkByColor.get(color).push(seg);
        } else if (link.type === 'chain') {
            chainSegs.push(seg);
        } else {
            // Hide small junction links when zoomed out (all visible at gridSize <= 50)
            if (gridSize > 50) {
                const sLen = s.record?.seqLength || 0;
                const tLen = t.record?.seqLength || 0;
                const maxLen = Math.max(sLen, tLen);
                const thresh = maxLen > 0 ? bubbleGridThreshold(maxLen) : 50;
                if (gridSize > thresh) continue;
            }
            junctionSegs.push(seg);
        }
    }

    renderedJunctionLinks = junctionSegs.length + delSegs.length;

    // --- Categorize nodes by color ---
    const nodesByColor = new Map(); // color → [{x, y, r}]
    let jNodeCount = 0;

    for (const node of nodes) {
        if (node.x == null || node.isPolychainNode || node.isAnchor) continue;
        if (!nodeVisible(node.x, node.y)) continue;
        if (node.chainId === '__junction__') {
            // Hide small junction nodes when zoomed out (all visible at gridSize <= 50)
            if (gridSize > 50) {
                const len = node.record?.seqLength || 0;
                const thresh = len > 0 ? bubbleGridThreshold(len) : 50;
                if (gridSize > thresh) continue;
            }
            jNodeCount++;
        }
        const r = baseWidth * 0.5;
        const circle = { x: node.x, y: node.y, r };
        const color = nodeColorForSelection(node);
        if (!nodesByColor.has(color)) nodesByColor.set(color, []);
        nodesByColor.get(color).push(circle);
    }
    renderedJunctionNodes = jNodeCount;

    // Gene halos are drawn separately via drawGeneHalos() before polychain lines

    // 1. Kink links (segment body)
    for (const [color, segs] of kinkByColor) {
        strokeSegments(ctx, segs, color, baseWidth, opacity, svg);
    }

    // 2. Chain links (bubble-to-bubble)
    if (chainSegs.length > 0) {
        strokeSegments(ctx, chainSegs, colorState.nodeColors[2], baseWidth, 0.8 * opacity, svg);
    }

    // 3. Junction + inter-chain links
    if (junctionSegs.length > 0) {
        strokeSegments(ctx, junctionSegs, colorState.linkColor, Math.max(0.5, baseWidth / 6), 0.6 * opacity, svg);
    }

    // 3b. Deletion links with -x- cross at midpoint
    if (delSegs.length > 0) {
        const delWidth = Math.max(0.5, baseWidth / 6);
        strokeSegments(ctx, delSegs, colorState.linkColor, delWidth, 0.6 * opacity, svg);
        if (!svg) {
            ctx.globalAlpha = 0.6 * opacity;
            const crossSize = Math.max(3, baseWidth);
            const crossWidth = Math.max(0.5, baseWidth / 6);
            for (const { x1, y1, x2, y2 } of delSegs) {
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const angle = Math.atan2(y2 - y1, x2 - x1);
                drawRotatedCross(ctx, midX, midY, crossSize, crossWidth, colorState.linkColor, angle);
            }
        }
    }

    // 4. Selection highlight underlay (red halo + connected link halos) — before nodes
    drawSelectionHighlight(ctx, scaleFactor, opacity, svg);

    // 6. Nodes
    for (const [color, circles] of nodesByColor) {
        fillCircles(ctx, circles, color, opacity, svg);
    }

    // 6. Hover highlight overlay (gray outline ring) — after nodes (skip during SVG export)
    if (!svg) drawHoverHighlight(ctx, scaleFactor, opacity);
}

/**
 * Draw gene annotation halos from all SimObjects' getGeneRenderables().
 * Batches by color for efficient rendering.
 */
export function drawGeneHalos(ctx, baseWidth, opacity, svg) {
    const specs = collectGeneRenderables();

    const haloWidth = Math.max(8, baseWidth * 5);
    const haloR = baseWidth * 1.75;

    // Filter by visibility + batch by color
    const circlesByColor = new Map();
    const linesByColor = new Map();
    const polylinesByColor = new Map();

    for (const spec of specs) {
        if (!isGeneVisible(spec.geneName)) continue;
        const c = spec.color;
        if (spec.type === 'circle') {
            if (!circlesByColor.has(c)) circlesByColor.set(c, []);
            circlesByColor.get(c).push({ x: spec.x, y: spec.y, r: haloR });
        } else if (spec.type === 'line') {
            if (!linesByColor.has(c)) linesByColor.set(c, []);
            linesByColor.get(c).push(spec);
        } else if (spec.type === 'polyline') {
            if (!polylinesByColor.has(c)) polylinesByColor.set(c, []);
            polylinesByColor.get(c).push(spec.points);
        }
    }

    // GFA link halos: highlight links where both endpoints share a gene annotation
    const links = getForceLinks();
    for (const link of links) {
        if (link.isPolychainLink || link.isSpineLink || link.isKinkLink) continue;
        const s = link.source, t = link.target;
        if (s?.x == null || t?.x == null) continue;

        const srcId = link.sourceId || link.sourceSegId;
        const tgtId = link.targetId || link.targetSegId;
        if (!srcId || !tgtId) continue;

        const srcObj = resolveSegment(srcId);
        const tgtObj = resolveSegment(tgtId);
        if (!srcObj?._geneOverlaps?.length || !tgtObj?._geneOverlaps?.length) continue;

        // Find first common visible gene
        for (const pin of srcObj._geneOverlaps) {
            if (!isGeneVisible(pin.name)) continue;
            if (tgtObj._geneOverlaps.some(p => p.name === pin.name)) {
                const color = mixGeneColor(pin.color);
                if (!linesByColor.has(color)) linesByColor.set(color, []);
                linesByColor.get(color).push({ x1: s.x, y1: s.y, x2: t.x, y2: t.y });
                break;
            }
        }
    }

    if (linesByColor.size === 0 && circlesByColor.size === 0 && polylinesByColor.size === 0) return;

    if (!svg) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    for (const [color, segs] of linesByColor) {
        strokeSegments(ctx, segs, color, haloWidth, opacity, svg);
    }
    for (const [color, circles] of circlesByColor) {
        fillCircles(ctx, circles, color, opacity, svg);
    }
    if (polylinesByColor.size > 0) {
        for (const [color, pls] of polylinesByColor) {
            _strokePolylines(ctx, pls, color, haloWidth, opacity, svg);
        }
    }
}

/** Minimal polyline stroke — avoids importing from polychain render chain. */
function _strokePolylines(ctx, polylines, color, width, opacity, svg) {
    if (svg) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = opacity;
    for (const pl of polylines) {
        if (pl.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) ctx.lineTo(pl[i][0], pl[i][1]);
        ctx.stroke();
    }
}

