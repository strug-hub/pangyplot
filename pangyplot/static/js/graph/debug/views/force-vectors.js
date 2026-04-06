// Debug view: force vector overlay.
// Y to toggle, U to cycle sub-modes.
// Self-contained — pulls data from force-data, force-engine, model-manager.

import { state } from '../../state.js';
import { registerView } from '../debug-orchestrator.js';
import { getForceNodes, getForceLinks } from '../../detail/data/force-data.js';
import { computeForceDeltas, linkStrength, linkDistance, chargeMaxDist } from '../../detail/engines/force-engine.js';
import { getContainer } from '../../detail/model/model-manager.js';

const MODES = ['all', 'charge', 'segCharge', 'link', 'layout', 'centroid', 'loop', 'smooth', 'balloon', 'parent', 'guide', 'anchorGap'];

const forceMap = {
    charge:      { color: '#FF4444', label: 'charge' },
    segCharge:   { color: '#FF8888', label: 'segCharge' },
    collide:     { color: '#AAAAAA', label: 'collide' },
    link:        { color: '#44AAFF', label: 'link' },
    layout:      { color: '#FFFF00', label: 'layout' },
    centroid:    { color: '#FF8800', label: 'centroid' },
    loopClosure: { color: '#AA44FF', label: 'loop' },
    smoothing:   { color: '#FF6688', label: 'smooth' },
    balloon:     { color: '#FFD700', label: 'balloon' },
    parentSide:  { color: '#44FF44', label: 'parent' },
    chainGuide:  { color: '#88FFFF', label: 'guide' },
    anchorGap:   { color: '#FF66FF', label: 'anchorGap' },
};

registerView({
    key: 'KeyY',
    keyLabel: 'Y',
    label: 'Force Vectors',

    draw(ctx) {
        const nodes = getForceNodes();
        const links = getForceLinks();
        const opacity = state.detailOpacity;
        drawForceVectors(ctx, nodes, links, opacity);
    },

    onActivate() { state.forceVectorMode = 'all'; },
    onDeactivate() { state.forceVectorMode = 'all'; },

    statusText() {
        if (state.forceVectorMode !== 'all') {
            return `mode: ${state.forceVectorMode}  (U to cycle)`;
        }
        return null;
    },

    subKeys: [{
        key: 'KeyU',
        action() {
            const idx = MODES.indexOf(state.forceVectorMode);
            state.forceVectorMode = MODES[(idx + 1) % MODES.length];
        },
    }],
});

// ---------------------------------------------------------------
// Main draw
// ---------------------------------------------------------------

function drawForceVectors(ctx, nodes, links, opacity) {
    const arrowScale = Math.max(3, 10 / state.zoom);
    const headLen = Math.max(3, 6 / state.zoom);
    const lw = Math.max(0.5, 1.5 / state.zoom);

    const pcNodes = nodes.filter(n => n.isPolychainNode && n.x != null);
    const segNodes = nodes.filter(n => !n.isPolychainNode && !n.isAnchor && n.x != null);
    const allVisNodes = [...pcNodes, ...segNodes];
    if (allVisNodes.length === 0) return;

    const mode = state.forceVectorMode || 'all';

    if (mode === 'guide') {
        _drawGuidePolylines(ctx, opacity);
        _drawGuideProjections(ctx, nodes, opacity);
    }

    const deltas = computeForceDeltas();

    _drawCentroids(ctx, pcNodes, opacity);
    _drawLoopFactorDots(ctx, pcNodes, opacity);
    _drawModeLabel(ctx, mode, opacity);

    ctx.globalAlpha = 0.7 * opacity;
    ctx.lineWidth = lw;

    if (mode === 'all') {
        for (const n of allVisNodes) {
            let bestMag = 0, bestColor = '#FFFFFF', totalFx = 0, totalFy = 0;
            for (const [name, info] of Object.entries(forceMap)) {
                const map = deltas[name];
                if (!map) continue;
                const d = map.get(n);
                if (!d) continue;
                totalFx += d.fx; totalFy += d.fy;
                const mag = Math.hypot(d.fx, d.fy);
                if (mag > bestMag) { bestMag = mag; bestColor = info.color; }
            }
            _drawArrow(ctx, n.x, n.y, totalFx, totalFy, bestColor, arrowScale, headLen);
        }
    } else if (mode !== 'guide') {
        const forceName = _forceNameForLabel(mode);
        const map = forceName ? deltas[forceName] : null;
        const color = Object.values(forceMap).find(f => f.label === mode)?.color || '#FFFFFF';
        if (map) {
            for (const n of allVisNodes) {
                const d = map.get(n);
                if (!d) continue;
                _drawArrow(ctx, n.x, n.y, d.fx, d.fy, color, arrowScale, headLen);
            }
        }
    }

    if (mode === 'balloon') _drawBalloonIndices(ctx, pcNodes, opacity);
    if (mode === 'charge') _drawChargeCircles(ctx, allVisNodes, opacity);
    if (mode === 'link') _drawLinkAnnotations(ctx, links, opacity);
    if (mode === 'parent') _drawParentPerps(ctx, pcNodes, opacity, headLen);
    if (mode === 'anchorGap') _drawAnchorGapPerps(ctx, nodes, opacity, headLen);

    ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function _drawArrow(ctx, nx, ny, fx, fy, color, arrowScale, headLen) {
    const mag = Math.hypot(fx, fy);
    if (mag < 0.0001) return;
    const len = mag * arrowScale;
    const ux = fx / mag, uy = fy / mag;
    const ex = nx + ux * len, ey = ny + uy * len;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(nx, ny); ctx.lineTo(ex, ey); ctx.stroke();
    const angle = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
    ctx.stroke();
}

function _forceNameForLabel(label) {
    for (const [name, info] of Object.entries(forceMap)) {
        if (info.label === label) return name;
    }
    return null;
}

function _drawGuidePolylines(ctx, opacity) {
    const dd = state.detailData;
    if (!dd) return;
    ctx.globalAlpha = 0.3 * opacity;
    ctx.strokeStyle = '#88FFFF';
    ctx.lineWidth = Math.max(1, 2 / state.zoom);
    ctx.setLineDash([Math.max(3, 6 / state.zoom), Math.max(2, 4 / state.zoom)]);
    for (const chain of dd.chains) {
        const pcN = getContainer(chain.id)?.spineNodes;
        if (!pcN || pcN.length < 2) continue;
        const real = pcN.filter(n => !n.isAnchor);
        if (real.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(real[0].x, real[0].y);
        for (let i = 1; i < real.length; i++) ctx.lineTo(real[i].x, real[i].y);
        ctx.stroke();
    }
    ctx.setLineDash([]);
}

function _drawGuideProjections(ctx, nodes, opacity) {
    ctx.globalAlpha = 0.3 * opacity;
    ctx.strokeStyle = '#88FFFF';
    ctx.lineWidth = Math.max(0.5, 1 / state.zoom);
    const chainPlCache = new Map();
    const guidedNodes = nodes.filter(n => !n.isPolychainNode && n.guideChainId && n.x != null);
    for (const n of guidedNodes) {
        let pl = chainPlCache.get(n.guideChainId);
        if (pl === undefined) {
            const pcN = getContainer(n.guideChainId)?.spineNodes;
            const real = pcN ? pcN.filter(nd => !nd.isAnchor) : null;
            pl = real && real.length >= 2 ? real.map(nd => [nd.x, nd.y]) : null;
            chainPlCache.set(n.guideChainId, pl);
        }
        if (!pl) continue;
        let bestDist = Infinity, bestX = 0, bestY = 0;
        for (let i = 0; i < pl.length - 1; i++) {
            const ax = pl[i][0], ay = pl[i][1];
            const bx = pl[i+1][0], by = pl[i+1][1];
            const dx = bx - ax, dy = by - ay;
            const lenSq = dx * dx + dy * dy;
            let t = 0;
            if (lenSq > 0) t = Math.max(0, Math.min(1, ((n.x - ax) * dx + (n.y - ay) * dy) / lenSq));
            const px = ax + t * dx, py = ay + t * dy;
            const d = Math.hypot(n.x - px, n.y - py);
            if (d < bestDist) { bestDist = d; bestX = px; bestY = py; }
        }
        ctx.beginPath();
        ctx.moveTo(n.x, n.y); ctx.lineTo(bestX, bestY); ctx.stroke();
    }
}

function _drawCentroids(ctx, pcNodes, opacity) {
    const chains = new Map();
    for (const n of pcNodes) {
        const root = n.chainId.split(':')[0];
        let g = chains.get(root);
        if (!g) { g = { cx: 0, cy: 0, count: 0 }; chains.set(root, g); }
        g.cx += n.x; g.cy += n.y; g.count++;
    }
    const triSize = Math.max(3, 8 / state.zoom);
    ctx.globalAlpha = 0.6 * opacity;
    ctx.fillStyle = '#FF8800';
    const labelSize = Math.max(4, 10 / state.zoom);
    for (const [chainId, g] of chains) {
        if (g.count < 3) continue;
        const cx = g.cx / g.count, cy = g.cy / g.count;
        ctx.beginPath();
        ctx.moveTo(cx, cy - triSize);
        ctx.lineTo(cx - triSize * 0.866, cy + triSize * 0.5);
        ctx.lineTo(cx + triSize * 0.866, cy + triSize * 0.5);
        ctx.closePath(); ctx.fill();
        let arc = 0;
        const chainNodes = pcNodes.filter(n => n.chainId === chainId);
        chainNodes.sort((a, b) => a.nodeIndex - b.nodeIndex);
        for (let i = 1; i < chainNodes.length; i++) {
            arc += Math.hypot(chainNodes[i].x - chainNodes[i-1].x, chainNodes[i].y - chainNodes[i-1].y);
        }
        const arcStr = arc >= 1000 ? (arc / 1000).toFixed(1) + 'k' : arc.toFixed(0);
        ctx.font = `${labelSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF8800';
        ctx.fillText(arcStr, cx, cy + triSize + labelSize);
    }
}

function _drawLoopFactorDots(ctx, pcNodes, opacity) {
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
}

function _drawModeLabel(ctx, mode, opacity) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '16px monospace';
    ctx.globalAlpha = 0.9;
    const lx = ctx.canvas.width / 2 - 90;
    const allModes = [['all', { color: '#FFFFFF', label: 'net' }], ...Object.entries(forceMap)];
    let y = ctx.canvas.height - 12;
    for (const [key, info] of [...allModes].reverse()) {
        const active = key === 'all' ? mode === 'all' : info.label === mode;
        ctx.fillStyle = active ? info.color : `${info.color}66`;
        ctx.fillText(`${active ? '\u25B6 ' : '  '}${info.label}`, lx, y);
        y -= 19;
    }
    ctx.fillStyle = '#888';
    ctx.fillText('[U] cycle  [Y] toggle', lx, y);
    ctx.restore();
}

function _drawBalloonIndices(ctx, pcNodes, opacity) {
    const fontSize = Math.max(4, 10 / state.zoom);
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.9 * opacity;
    for (const n of pcNodes) {
        if (n.nodeIndex == null) continue;
        ctx.fillStyle = n.nodeIndex === 0 ? '#00FF00'
            : n.nodeIndex === n.chainNodeCount - 1 ? '#FF4444' : '#FFD700';
        ctx.fillText(n.nodeIndex, n.x, n.y - fontSize * 1.2);
    }
}

function _drawChargeCircles(ctx, allVisNodes, opacity) {
    ctx.globalAlpha = 0.15 * opacity;
    ctx.strokeStyle = '#FF4444';
    ctx.lineWidth = Math.max(0.5, 1 / state.zoom);
    for (const n of allVisNodes) {
        const r = chargeMaxDist(n);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function _drawLinkAnnotations(ctx, links, opacity) {
    const fontSize = Math.max(6, 16 / state.zoom);
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.9 * opacity;
    ctx.fillStyle = '#AAAAAA';
    for (const l of links) {
        const s = l.source, t = l.target;
        if (s.x == null || t.x == null) continue;
        const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
        const str = linkStrength(l);
        const dist = linkDistance(l);
        const sLabel = str < 0.01 ? str.toExponential(0) : str.toPrecision(2);
        const dLabel = dist < 1 ? dist.toPrecision(2) : Math.round(dist);
        ctx.textBaseline = 'bottom';
        ctx.fillText(`s:${sLabel}`, mx, my);
        ctx.textBaseline = 'top';
        ctx.fillText(`d:${dLabel}`, mx, my);
    }
}

function _drawParentPerps(ctx, pcNodes, opacity, headLen) {
    const perpLen = Math.max(8, 20 / state.zoom);
    const tangentHalf = Math.max(12, 30 / state.zoom);
    ctx.globalAlpha = 0.8 * opacity;
    ctx.lineWidth = Math.max(0.5, 2 / state.zoom);
    const perpColors = ['#44FF44', '#22CC22', '#119911'];
    const tangentColors = ['#88FF88', '#66DD66', '#44BB44'];
    const drawnTangents = new Set();

    for (const n of pcNodes) {
        if (!n.parentPerps) continue;
        for (let ai = 0; ai < n.parentPerps.length; ai++) {
            const p = n.parentPerps[ai];
            const perpColor = perpColors[Math.min(ai, perpColors.length - 1)];
            const tanColor = tangentColors[Math.min(ai, tangentColors.length - 1)];
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
            ctx.strokeStyle = perpColor;
            const ex = n.x + p.px * perpLen, ey = n.y + p.py * perpLen;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y); ctx.lineTo(ex, ey); ctx.stroke();
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

function _drawAnchorGapPerps(ctx, nodes, opacity, headLen) {
    const EPSILON = 0.005;
    const perpLen = Math.max(12, 30 / state.zoom);
    const dotR = Math.max(2, 4 / state.zoom);
    const fontSize = Math.max(5, 12 / state.zoom);

    // Only show anchors on chains that have popped bubbles
    const anchors = nodes.filter(n => {
        if (!n.isAnchor || !n.simObject?.container) return false;
        return n.simObject.container.poppedRanges.length > 0;
    });
    if (anchors.length === 0) return;

    ctx.globalAlpha = 0.8 * opacity;
    ctx.lineWidth = Math.max(0.5, 1.5 / state.zoom);

    for (const anchor of anchors) {
        const seg = anchor.simObject;
        const container = seg.container;
        if (!container) continue;

        const isHead = anchor === seg.headAnchor;
        const t = isHead ? seg.tRange.start : seg.tRange.end;

        // Compute tangent
        const tA = Math.max(0, t - EPSILON);
        const tB = Math.min(1, t + EPSILON);
        const pA = container.positionAt(tA);
        const pB = container.positionAt(tB);
        let tx = pB.x - pA.x;
        let ty = pB.y - pA.y;
        const tLen = Math.hypot(tx, ty);
        if (tLen < 0.001) continue;
        tx /= tLen;
        ty /= tLen;

        // Perpendicular
        const nx = -ty;
        const ny = tx;

        // Push direction arrow (into the gap)
        const pushX = isHead ? -tx : tx;
        const pushY = isHead ? -ty : ty;

        // Draw anchor dot
        ctx.fillStyle = '#FF66FF';
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, dotR, 0, Math.PI * 2);
        ctx.fill();

        // Draw perpendicular line through anchor
        ctx.strokeStyle = '#FF66FF';
        ctx.setLineDash([Math.max(2, 4 / state.zoom), Math.max(1, 2 / state.zoom)]);
        ctx.beginPath();
        ctx.moveTo(anchor.x - nx * perpLen, anchor.y - ny * perpLen);
        ctx.lineTo(anchor.x + nx * perpLen, anchor.y + ny * perpLen);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw push direction arrow
        const arrowLen = perpLen * 0.6;
        const ex = anchor.x + pushX * arrowLen;
        const ey = anchor.y + pushY * arrowLen;
        ctx.strokeStyle = '#FF66FF';
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(pushY, pushX);
        const hl = headLen * 0.7;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - hl * Math.cos(angle - 0.4), ey - hl * Math.sin(angle - 0.4));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - hl * Math.cos(angle + 0.4), ey - hl * Math.sin(angle + 0.4));
        ctx.stroke();

        // Label
        ctx.fillStyle = '#FF66FF';
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const label = isHead ? 'H' : 'T';
        ctx.fillText(`${label} t=${t.toFixed(3)}`, anchor.x, anchor.y - dotR - 2 / state.zoom);
    }
}
