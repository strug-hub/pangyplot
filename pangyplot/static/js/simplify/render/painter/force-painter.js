// Force graph rendering: nodes and links from the D3 simulation.

import { state } from '../../simplify-state.js';
import { getForceNodes, getForceLinks } from '../../data/simplify-force.js';

export function drawForceGraph(ctx, baseWidth) {
    const nodes = getForceNodes();
    const links = getForceLinks();
    if (nodes.length === 0) return;

    // Nodes — radius in data-space units; we're inside ctx.scale(zoom)
    const nodeR = Math.max(1.5, 3 / state.zoom);

    // Kink links (segment body) — thick, matching node diameter
    ctx.lineCap = 'round';
    ctx.lineWidth = nodeR * 2;
    ctx.setLineDash([]);
    ctx.globalAlpha = state.detailOpacity;
    for (const link of links) {
        if (!link.isKinkLink) continue;
        const s = link.source, t = link.target;
        if (s.x == null || t.x == null) continue;
        ctx.strokeStyle = s.type === 'bubble' ? '#F2DC0F' : '#0762E5';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
    }

    // Chain links (bubble-to-bubble) — thick, orange
    ctx.lineWidth = nodeR * 2;
    ctx.globalAlpha = 0.8 * state.detailOpacity;
    ctx.strokeStyle = '#FF6700';
    for (const link of links) {
        if (link.isKinkLink || link.isJunctionLink || link.isInterChain) continue;
        const s = link.source, t = link.target;
        if (s.x == null || t.x == null) continue;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
    }

    // Junction + inter-chain links — thin gray
    ctx.strokeStyle = '#969696';
    ctx.lineWidth = Math.max(0.5, 1 / state.zoom);
    ctx.globalAlpha = 0.6 * state.detailOpacity;
    ctx.beginPath();
    for (const link of links) {
        if (link.isKinkLink || (!link.isJunctionLink && !link.isInterChain)) continue;
        const s = link.source, t = link.target;
        if (s.x == null || t.x == null) continue;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
    }
    ctx.stroke();
    ctx.globalAlpha = state.detailOpacity;
    const hovNode = state.hoveredForceNode || state.hoveredBubble;
    for (const node of nodes) {
        if (node.x == null || node.isPhantom) continue;
        ctx.fillStyle = node.type === 'bubble' ? '#F2DC0F' : '#0762E5';
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeR, 0, Math.PI * 2);
        ctx.fill();
    }
    // Highlight ring on hovered node
    if (hovNode && hovNode.x != null) {
        ctx.strokeStyle = '#FAB3AE';
        ctx.lineWidth = Math.max(1, 2 / state.zoom);
        ctx.beginPath();
        ctx.arc(hovNode.x, hovNode.y, nodeR * 1.8, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = state.detailOpacity;
}
