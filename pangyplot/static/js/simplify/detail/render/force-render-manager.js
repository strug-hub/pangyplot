// Force graph render manager: categorizes nodes/links, delegates to detail-painter.

import { state } from '../../simplify-state.js';
import { getForceNodes, getForceLinks } from '../data/force-data.js';
import { fillCircles, strokeSegments } from './detail-painter.js';
import { drawRotatedCross } from '../../../graph/render/painter/painter-utils.js';
import { drawSelectionHighlight, drawHoverHighlight } from './highlight-painter.js';
import { pcSettings, computeForceDeltas } from '../engines/force-engine.js';
import { getGenePins, isGeneVisible } from '@simplify-data/gene-data.js';
import { getNodeColor } from '../../../graph/render/color/color-style.js';
import { colorState } from '../../../graph/render/color/color-state.js';
import { bubbleGridThreshold } from '../data/bubble-meta-cache.js';

/** Last-frame rendered junction counts (read by status-bar). */
export let renderedJunctionNodes = 0;
export let renderedJunctionLinks = 0;

export function drawForceGraph(ctx, baseWidth, svg = null, vp = null) {
    const nodes = getForceNodes();
    const links = getForceLinks();
    if (nodes.length === 0) return;

    // Use baseWidth (from polychain-render-manager) so naked nodes match polychain size
    const scaleFactor = baseWidth / 5;   // kept for highlight helpers
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
    const genePins = getGenePins();

    for (const link of links) {
        if (link.isPolychainLink) continue;  // rendered as polyline by polychain-render-manager
        const s = link.source, t = link.target;
        if (s.x == null || t.x == null) continue;
        if (!linkVisible(s, t)) continue;
        const seg = { x1: s.x, y1: s.y, x2: t.x, y2: t.y };

        if (link.isDel) {
            delSegs.push(seg);
        } else if (link.isKinkLink) {
            const color = getNodeColor(s);
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

    // --- Categorize nodes by color (needed for gene halos before links) ---
    const nodesByColor = new Map(); // color → [{x, y, r}]
    const geneHaloCircles = new Map(); // color → [{x, y, r}]
    let jNodeCount = 0;

    for (const node of nodes) {
        if (node.x == null || node.isPhantom || node.isPolychainNode) continue;
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
        const r = (node.width || 5) * scaleFactor * 0.5;
        const circle = { x: node.x, y: node.y, r };
        const color = getNodeColor(node);
        if (!nodesByColor.has(color)) nodesByColor.set(color, []);
        nodesByColor.get(color).push(circle);
        if (node.type !== 'bubble') {
            for (const pin of genePins) {
                if (!isGeneVisible(pin.name)) continue;
                if (node.x >= pin.startX && node.x <= pin.endX) {
                    if (!geneHaloCircles.has(pin.color)) geneHaloCircles.set(pin.color, []);
                    geneHaloCircles.get(pin.color).push({ x: node.x, y: node.y, r: r * 2.5 });
                    break;
                }
            }
        }
    }
    renderedJunctionNodes = jNodeCount;

    // 0. Gene halos (both link and node halos, rendered before all links/nodes)
    if (genePins.length > 0) {
        const haloWidth = Math.max(4, 10 / state.zoom);
        const haloLinksByColor = new Map();
        for (const segs of kinkByColor.values()) {
            for (const seg of segs) {
                const midX = (seg.x1 + seg.x2) / 2;
                for (const pin of genePins) {
                    if (!isGeneVisible(pin.name)) continue;
                    if (midX >= pin.startX && midX <= pin.endX) {
                        if (!haloLinksByColor.has(pin.color)) haloLinksByColor.set(pin.color, []);
                        haloLinksByColor.get(pin.color).push(seg);
                        break;
                    }
                }
            }
        }
        for (const [color, segs] of haloLinksByColor) {
            strokeSegments(ctx, segs, color, haloWidth, opacity, svg);
        }
        for (const [color, circles] of geneHaloCircles) {
            fillCircles(ctx, circles, color, opacity, svg);
        }
    }

    // 1. Kink links (segment body) — width matches source node
    for (const [color, segs] of kinkByColor) {
        strokeSegments(ctx, segs, color, 5 * scaleFactor, opacity, svg);
    }

    // 2. Chain links (bubble-to-bubble)
    if (chainSegs.length > 0) {
        strokeSegments(ctx, chainSegs, colorState.nodeColors[2], 5 * scaleFactor, 0.8 * opacity, svg);
    }

    // 3. Junction + inter-chain links
    if (junctionSegs.length > 0) {
        strokeSegments(ctx, junctionSegs, colorState.linkColor, Math.max(0.5, 1 / state.zoom), 0.6 * opacity, svg);
    }

    // 3b. Deletion links with -x- cross at midpoint
    if (delSegs.length > 0) {
        const delWidth = Math.max(0.5, 1 / state.zoom);
        strokeSegments(ctx, delSegs, colorState.linkColor, delWidth, 0.6 * opacity, svg);
        if (!svg) {
            ctx.globalAlpha = 0.6 * opacity;
            const crossSize = Math.max(3, 6 / state.zoom);
            const crossWidth = Math.max(0.5, 1 / state.zoom);
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

    // 7. Force vector debug overlay (Y key, skip during SVG export)
    if (!svg && state.forceVectors) {
        drawForceVectors(ctx, nodes, links, opacity);
    }
}

function drawForceVectors(ctx, nodes, links, opacity) {
    const arrowScale = Math.max(3, 10 / state.zoom);
    const headLen = Math.max(3, 6 / state.zoom);
    const lw = Math.max(0.5, 1.5 / state.zoom);

    const pcNodes = nodes.filter(n => n.isPolychainNode && n.x != null);
    if (pcNodes.length === 0) return;

    // Map D3 force names → display names + colors
    const forceMap = {
        charge:          { color: '#FF4444', label: 'charge' },
        collide:         { color: '#AAAAAA', label: 'collide' },
        link:            { color: '#44AAFF', label: 'link' },
        layout:          { color: '#FFFF00', label: 'layout' },
        intraChain:      { color: '#FF00FF', label: 'intra' },
        centroid:        { color: '#FF8800', label: 'centroid' },
        loopClosure:     { color: '#AA44FF', label: 'loop' },
        smoothing:       { color: '#FF6688', label: 'smooth' },
        balloon:         { color: '#FFD700', label: 'balloon' },
        pcLinkRepulsion: { color: '#00FFAA', label: 'linkRepul' },
        parentSide:      { color: '#44FF44', label: 'parent' },
    };

    // Compute real force deltas on demand (runs each force once, restores vx/vy)
    const deltas = computeForceDeltas();

    // Draw chain centroids as triangles
    const chains = new Map();
    for (const n of pcNodes) {
        let g = chains.get(n.chainId);
        if (!g) { g = { cx: 0, cy: 0, count: 0 }; chains.set(n.chainId, g); }
        g.cx += n.x; g.cy += n.y; g.count++;
    }
    const triSize = Math.max(3, 8 / state.zoom);
    ctx.globalAlpha = 0.6 * opacity;
    ctx.fillStyle = '#FF8800';
    for (const g of chains.values()) {
        if (g.count < 3) continue;
        const cx = g.cx / g.count, cy = g.cy / g.count;
        ctx.beginPath();
        ctx.moveTo(cx, cy - triSize);
        ctx.lineTo(cx - triSize * 0.866, cy + triSize * 0.5);
        ctx.lineTo(cx + triSize * 0.866, cy + triSize * 0.5);
        ctx.closePath();
        ctx.fill();
    }

    // Color nodes by loopFactor: blue (0) → yellow (0.5) → red (1)
    const dotS = Math.max(3, 8 / state.zoom);
    ctx.globalAlpha = 0.8 * opacity;
    for (const n of pcNodes) {
        const lf = n.loopFactor || 0;
        const r = Math.round(Math.min(1, lf * 2) * 255);
        const g = Math.round(lf < 0.5 ? lf * 2 * 255 : (1 - (lf - 0.5) * 2) * 255);
        const b = Math.round(Math.max(0, 1 - lf * 2) * 255);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(n.x - dotS / 2, n.y - dotS / 2, dotS, dotS);
    }

    const mode = state.forceVectorMode || 'all';

    // Label in screen space — always show all types, arrow on active
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '14px monospace';
    ctx.globalAlpha = 0.9;
    const lx = ctx.canvas.width / 2 - 80;
    const entries = Object.entries(forceMap);
    let y = ctx.canvas.height - 10;
    // "all" is a virtual mode not in forceMap
    const allModes = [['all', { color: '#FFFFFF', label: 'net' }], ...entries];
    for (const [key, info] of [...allModes].reverse()) {
        const active = key === 'all' ? mode === 'all' : info.label === mode;
        ctx.fillStyle = active ? info.color : `${info.color}66`;
        ctx.fillText(`${active ? '\u25B6 ' : '  '}${info.label}`, lx, y);
        y -= 16;
    }
    ctx.fillStyle = '#888';
    ctx.fillText('[U] cycle  [Y] toggle', lx, y);
    ctx.restore();

    ctx.globalAlpha = 0.7 * opacity;
    ctx.lineWidth = lw;

    function drawArrow(nx, ny, fx, fy, color) {
        const mag = Math.hypot(fx, fy);
        if (mag < 0.0001) return;
        const len = mag * arrowScale;
        const ux = fx / mag, uy = fy / mag;
        const ex = nx + ux * len, ey = ny + uy * len;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const angle = Math.atan2(uy, ux);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
        ctx.stroke();
    }

    // Find the D3 force name matching a display label
    function forceNameForLabel(label) {
        for (const [name, info] of Object.entries(forceMap)) {
            if (info.label === label) return name;
        }
        return null;
    }

    if (mode === 'all') {
        for (const n of pcNodes) {
            let bestMag = 0, bestColor = '#FFFFFF', totalFx = 0, totalFy = 0;
            for (const [name, info] of Object.entries(forceMap)) {
                const map = deltas[name];
                if (!map) continue;
                const d = map.get(n);
                if (!d) continue;
                totalFx += d.fx;
                totalFy += d.fy;
                const mag = Math.hypot(d.fx, d.fy);
                if (mag > bestMag) { bestMag = mag; bestColor = info.color; }
            }
            drawArrow(n.x, n.y, totalFx, totalFy, bestColor);
        }
    } else {
        const forceName = forceNameForLabel(mode);
        const map = forceName ? deltas[forceName] : null;
        const color = Object.values(forceMap).find(f => f.label === mode)?.color || '#FFFFFF';
        if (map) {
            for (const n of pcNodes) {
                const d = map.get(n);
                if (!d) continue;
                drawArrow(n.x, n.y, d.fx, d.fy, color);
            }
        }
    }

    // Draw node indices on polychain nodes in balloon mode
    if (mode === 'balloon') {
        const fontSize = Math.max(4, 10 / state.zoom);
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.9 * opacity;
        for (const n of pcNodes) {
            if (n.nodeIndex == null) continue;
            ctx.fillStyle = n.nodeIndex === 0 ? '#00FF00'
                : n.nodeIndex === n.chainNodeCount - 1 ? '#FF4444'
                : '#FFD700';
            ctx.fillText(n.nodeIndex, n.x, n.y - fontSize * 1.2);
        }
    }

    // Draw cached parentPerps + tangent lines on child chain nodes
    if (mode === 'parent') {
        const perpLen = Math.max(8, 20 / state.zoom);
        const tangentHalf = Math.max(12, 30 / state.zoom);
        ctx.globalAlpha = 0.8 * opacity;
        ctx.lineWidth = Math.max(0.5, 2 / state.zoom);

        // Ancestor depth colors: immediate parent → grandparent → great-grandparent
        const perpColors = ['#44FF44', '#22CC22', '#119911'];
        const tangentColors = ['#88FF88', '#66DD66', '#44BB44'];

        // Collect unique projection points
        const drawnTangents = new Set();

        for (const n of pcNodes) {
            if (!n.parentPerps) continue;
            for (let ai = 0; ai < n.parentPerps.length; ai++) {
                const p = n.parentPerps[ai];
                const perpColor = perpColors[Math.min(ai, perpColors.length - 1)];
                const tanColor = tangentColors[Math.min(ai, tangentColors.length - 1)];

                // Tangent line at projection point (one per ancestor per chain)
                const tangentKey = `${ai}:${p.mx},${p.my}`;
                if (!drawnTangents.has(tangentKey)) {
                    drawnTangents.add(tangentKey);
                    const tanX = -p.py, tanY = p.px;
                    ctx.strokeStyle = tanColor;
                    ctx.beginPath();
                    ctx.moveTo(p.mx - tanX * tangentHalf, p.my - tanY * tangentHalf);
                    ctx.lineTo(p.mx + tanX * tangentHalf, p.my + tanY * tangentHalf);
                    ctx.stroke();
                    ctx.fillStyle = tanColor;
                    ctx.beginPath();
                    ctx.arc(p.mx, p.my, Math.max(1.5, 3 / state.zoom), 0, Math.PI * 2);
                    ctx.fill();
                }

                // Perp arrow from node
                ctx.strokeStyle = perpColor;
                const ex = n.x + p.px * perpLen;
                const ey = n.y + p.py * perpLen;
                ctx.beginPath();
                ctx.moveTo(n.x, n.y);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                const angle = Math.atan2(p.py, p.px);
                const hl = headLen * 0.7;
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - hl * Math.cos(angle - 0.5), ey - hl * Math.sin(angle - 0.5));
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - hl * Math.cos(angle + 0.5), ey - hl * Math.sin(angle + 0.5));
                ctx.stroke();
            }
        }
    }

    ctx.globalAlpha = 1;
}
