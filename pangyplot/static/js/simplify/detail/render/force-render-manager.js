// Force graph render manager: categorizes nodes/links, delegates to detail-painter.

import { state } from '../../simplify-state.js';
import { getForceNodes, getForceLinks } from '../data/force-data.js';
import { fillCircles, strokeRing, strokeSegments } from './detail-painter.js';

export function drawForceGraph(ctx, baseWidth) {
    const nodes = getForceNodes();
    const links = getForceLinks();
    if (nodes.length === 0) return;

    // Scale factor matching core: node.width * scaleFactor gives visual size
    const scaleFactor = Math.max(0.3, 2 / state.zoom);
    const opacity = state.detailOpacity;

    ctx.lineCap = 'round';

    // --- Categorize links ---
    const kinkByColor = new Map();
    const chainSegs = [];
    const junctionSegs = [];

    for (const link of links) {
        const s = link.source, t = link.target;
        if (s.x == null || t.x == null) continue;
        const seg = { x1: s.x, y1: s.y, x2: t.x, y2: t.y };

        if (link.isKinkLink) {
            const color = s.type === 'bubble' ? '#F2DC0F' : '#0762E5';
            if (!kinkByColor.has(color)) kinkByColor.set(color, []);
            kinkByColor.get(color).push(seg);
        } else if (link.type === 'chain') {
            chainSegs.push(seg);
        } else {
            junctionSegs.push(seg);
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

    // --- Categorize nodes ---
    const bubbleCircles = [];
    const segCircles = [];
    const phantomStars = [];

    for (const node of nodes) {
        if (node.x == null) continue;
        if (node.isPhantom) {
            phantomStars.push({ x: node.x, y: node.y });
            continue;
        }
        const r = (node.width || 5) * scaleFactor * 0.5;
        const circle = { x: node.x, y: node.y, r };
        if (node.type === 'bubble') {
            bubbleCircles.push(circle);
        } else {
            segCircles.push(circle);
        }
    }

    // 4. Nodes
    if (bubbleCircles.length > 0) fillCircles(ctx, bubbleCircles, '#F2DC0F', opacity);
    if (segCircles.length > 0) fillCircles(ctx, segCircles, '#0762E5', opacity);

    // 4b. Phantom debug stars
    if (phantomStars.length > 0) {
        const starR = Math.max(4, 8 / state.zoom);
        ctx.fillStyle = '#FF00FF';
        ctx.globalAlpha = opacity;
        for (const s of phantomStars) {
            drawStar(ctx, s.x, s.y, 5, starR, starR * 0.4);
        }
    }

    // 5. Hover highlight ring
    const hovNode = state.hoveredForceNode || state.hoveredBubble;
    if (hovNode && hovNode.x != null) {
        const hovR = (hovNode.width || 5) * scaleFactor * 0.5;
        strokeRing(ctx, hovNode.x, hovNode.y, hovR * 1.8,
            '#FAB3AE', Math.max(1, 2 / state.zoom), opacity);
    }
}

function drawStar(ctx, cx, cy, points, outerR, innerR) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / points) * i - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}
