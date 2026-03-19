// Force graph render manager: categorizes nodes/links, delegates to detail-painter.

import { state } from '../../simplify-state.js';
import { getForceNodes, getForceLinks } from '../data/force-data.js';
import { fillCircles, strokeSegments } from './detail-painter.js';
import { drawRotatedCross } from '../../../graph/render/painter/painter-utils.js';
import { drawSelectionHighlight, drawHoverHighlight } from './highlight-painter.js';
import { pcSettings, computeForceDeltas } from '../engines/force-engine.js';
import { getGenePins } from '../../skeleton/data/gene-data.js';
import { geneHaloColor } from '../../utils/color-hash.js';

export function drawForceGraph(ctx, baseWidth) {
    const nodes = getForceNodes();
    const links = getForceLinks();
    if (nodes.length === 0) return;

    // Use baseWidth (from polychain-render-manager) so naked nodes match polychain size
    const scaleFactor = baseWidth / 5;   // kept for highlight helpers
    const opacity = state.detailOpacity;

    ctx.lineCap = 'round';

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
        const seg = { x1: s.x, y1: s.y, x2: t.x, y2: t.y };

        if (link.isDel) {
            delSegs.push(seg);
        } else if (link.isKinkLink) {
            const color = s.type === 'bubble' ? '#F2DC0F' : '#0762E5';
            if (!kinkByColor.has(color)) kinkByColor.set(color, []);
            kinkByColor.get(color).push(seg);
        } else if (link.type === 'chain') {
            chainSegs.push(seg);
        } else {
            junctionSegs.push(seg);
        }
    }

    // --- Categorize nodes (needed for gene halos before links) ---
    const bubbleCircles = [];
    const segCircles = [];
    const geneHaloCircles = new Map(); // color → [{x, y, r}]

    for (const node of nodes) {
        if (node.x == null || node.isPhantom || node.isPolychainNode) continue;
        const r = (node.width || 5) * scaleFactor * 0.5;
        const circle = { x: node.x, y: node.y, r };
        if (node.type === 'bubble') {
            bubbleCircles.push(circle);
        } else {
            segCircles.push(circle);
            for (const pin of genePins) {
                if (node.x >= pin.startX && node.x <= pin.endX) {
                    const color = geneHaloColor(pin.name);
                    if (!geneHaloCircles.has(color)) geneHaloCircles.set(color, []);
                    geneHaloCircles.get(color).push({ x: node.x, y: node.y, r: r * 2.5 });
                    break;
                }
            }
        }
    }

    // 0. Gene halos (both link and node halos, rendered before all links/nodes)
    if (genePins.length > 0) {
        const haloWidth = Math.max(4, 10 / state.zoom);
        const haloLinksByColor = new Map();
        for (const segs of kinkByColor.values()) {
            for (const seg of segs) {
                const midX = (seg.x1 + seg.x2) / 2;
                for (const pin of genePins) {
                    if (midX >= pin.startX && midX <= pin.endX) {
                        const color = geneHaloColor(pin.name);
                        if (!haloLinksByColor.has(color)) haloLinksByColor.set(color, []);
                        haloLinksByColor.get(color).push(seg);
                        break;
                    }
                }
            }
        }
        for (const [color, segs] of haloLinksByColor) {
            strokeSegments(ctx, segs, color, haloWidth, opacity);
        }
        for (const [color, circles] of geneHaloCircles) {
            fillCircles(ctx, circles, color, opacity);
        }
    }

    // 1. Kink links (segment body) — width matches source node
    for (const [color, segs] of kinkByColor) {
        strokeSegments(ctx, segs, color, 5 * scaleFactor, opacity);
    }

    // 2. Chain links (bubble-to-bubble)
    if (chainSegs.length > 0) {
        strokeSegments(ctx, chainSegs, '#FF6700', 5 * scaleFactor, 0.8 * opacity);
    }

    // 3. Junction + inter-chain links
    if (junctionSegs.length > 0) {
        strokeSegments(ctx, junctionSegs, '#969696', Math.max(0.5, 1 / state.zoom), 0.6 * opacity);
    }

    // 3b. Deletion links with -x- cross at midpoint
    if (delSegs.length > 0) {
        const delWidth = Math.max(0.5, 1 / state.zoom);
        strokeSegments(ctx, delSegs, '#969696', delWidth, 0.6 * opacity);
        ctx.globalAlpha = 0.6 * opacity;
        const crossSize = Math.max(3, 6 / state.zoom);
        const crossWidth = Math.max(0.5, 1 / state.zoom);
        for (const { x1, y1, x2, y2 } of delSegs) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            drawRotatedCross(ctx, midX, midY, crossSize, crossWidth, '#969696', angle);
        }
    }

    // 4. Selection highlight underlay (red halo + connected link halos) — before nodes
    drawSelectionHighlight(ctx, scaleFactor, opacity);

    // 6. Nodes
    if (bubbleCircles.length > 0) fillCircles(ctx, bubbleCircles, '#F2DC0F', opacity);
    if (segCircles.length > 0) fillCircles(ctx, segCircles, '#0762E5', opacity);

    // 6. Hover highlight overlay (gray outline ring) — after nodes
    drawHoverHighlight(ctx, scaleFactor, opacity);

    // 7. Force vector debug overlay (Y key)
    if (state.forceVectors) {
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

    const mode = state.forceVectorMode || 'all';

    // Label in screen space
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '14px monospace';
    ctx.globalAlpha = 0.9;
    const lx = ctx.canvas.width / 2 - 80;
    if (mode === 'all') {
        let y = ctx.canvas.height - 10;
        for (const [name, info] of Object.entries(forceMap).reverse()) {
            ctx.fillStyle = info.color;
            ctx.fillText(info.label, lx, y);
            y -= 16;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('dominant force [U to cycle]', lx, y);
    } else {
        const info = Object.values(forceMap).find(f => f.label === mode);
        ctx.fillStyle = info?.color || '#FFFFFF';
        ctx.fillText(`force: ${mode} [U to cycle]`, lx, ctx.canvas.height - 10);
    }
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

    // Draw cached parentPerps + tangent lines on child chain nodes
    if (mode === 'all' || mode === 'parent') {
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
