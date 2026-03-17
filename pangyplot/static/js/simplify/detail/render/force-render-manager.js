// Force graph render manager: categorizes nodes/links, delegates to detail-painter.

import { state } from '../../simplify-state.js';
import { getForceNodes, getForceLinks } from '../data/force-data.js';
import { fillCircles, strokeRing, strokeSegments } from './detail-painter.js';
import { drawRotatedCross } from '../../../graph/render/painter/painter-utils.js';

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
    const delSegs = [];

    for (const link of links) {
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

    // --- Categorize nodes ---
    const bubbleCircles = [];
    const segCircles = [];

    for (const node of nodes) {
        if (node.x == null || node.isPhantom) continue;
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

    // 5. Selection highlight ring (green, thicker)
    const selNode = state.selectedNode;
    if (selNode && selNode.x != null) {
        const selR = (selNode.width || 5) * scaleFactor * 0.5;
        strokeRing(ctx, selNode.x, selNode.y, selR * 2.0,
            '#2ecc71', Math.max(1.5, 3 / state.zoom), opacity);
    }

    // 6. Hover highlight ring
    const hovNode = state.hoveredForceNode || state.hoveredBubble;
    if (hovNode && hovNode.x != null) {
        const hovR = (hovNode.width || 5) * scaleFactor * 0.5;
        strokeRing(ctx, hovNode.x, hovNode.y, hovR * 1.8,
            '#FAB3AE', Math.max(1, 2 / state.zoom), opacity);
    }

    // 7. Force vector debug overlay (Y key)
    if (state.forceVectors) {
        drawForceVectors(ctx, nodes, links, opacity);
    }
}

function drawForceVectors(ctx, nodes, links, opacity) {
    // Compute net force vector per node from link springs + layout pull.
    // This mirrors what D3 computes each tick, shown as arrows.
    const forces = new Map(); // iid → {fx, fy}
    for (const n of nodes) {
        if (n.x == null) continue;
        forces.set(n.iid, { fx: 0, fy: 0 });
    }

    // Link forces: spring toward rest length
    for (const link of links) {
        const s = link.source, t = link.target;
        if (s.x == null || t.x == null) continue;
        const sf = forces.get(s.iid), tf = forces.get(t.iid);
        if (!sf || !tf) continue;

        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.hypot(dx, dy) || 1;
        const rest = (link.length || 10) * 1; // * LINK_STRENGTH
        const strength = link.isInterChain ? 0.3 : 1;
        const pull = (dist - rest) / dist * strength;

        const pfx = dx * pull * 0.5;
        const pfy = dy * pull * 0.5;
        if (s.fx == null) { sf.fx += pfx; sf.fy += pfy; }
        if (t.fx == null) { tf.fx -= pfx; tf.fy -= pfy; }
    }

    // Layout force: pull toward homeX/homeY
    for (const n of nodes) {
        if (n.x == null || n.fx != null) continue;
        const f = forces.get(n.iid);
        if (!f || n.homeX == null) continue;
        const dx = n.homeX - n.x, dy = n.homeY - n.y;
        f.fx += dx * 0.02; // approximate layout force strength
        f.fy += dy * 0.02;
    }

    // Draw arrows
    const arrowScale = Math.max(1, 3 / state.zoom);
    ctx.globalAlpha = 0.8 * opacity;
    ctx.lineWidth = Math.max(0.5, 1.5 / state.zoom);
    const headLen = Math.max(3, 6 / state.zoom);

    for (const n of nodes) {
        if (n.x == null || n.fx != null || n.isPhantom) continue;
        const f = forces.get(n.iid);
        if (!f) continue;

        const mag = Math.hypot(f.fx, f.fy);
        if (mag < 0.01) continue;

        // Clamp vector length for visibility
        const maxLen = Math.max(20, 60 / state.zoom);
        const len = Math.min(mag * arrowScale, maxLen);
        const ux = f.fx / mag, uy = f.fy / mag;
        const ex = n.x + ux * len, ey = n.y + uy * len;

        // Color: green for link-dominant, blue for layout-dominant
        ctx.strokeStyle = '#00FF88';
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(uy, ux);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
        ctx.stroke();
    }
}
