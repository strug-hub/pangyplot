// Debug scatterplot: draggable floating window with chain/link analysis plots.
// Self-contained — no external CSS or modal dependencies. Safe to delete entirely.

import { isDebugMode } from '@app-state';
import eventBus from '@event-bus';
import { state } from '../simplify-state.js';

let panel = null;
let canvas = null;
let ctx = null;
let activeTab = 'nodes';
let refreshInterval = null;
let lastScreenPoints = [];

// ---------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------

function getNodeCountPoints() {
    const chains = state.detailData?.chains || [];
    const pcNodes = window.__pcNodes;
    if (!pcNodes) return [];

    return chains.map(c => {
        const nodes = pcNodes.get(c.id);
        if (!nodes || nodes.length < 2) return null;
        return {
            x: c.bpSpan || 0,
            y: nodes.length,
            label: c.id,
            lf: nodes[0].loopFactor || 0,
        };
    }).filter(p => p && p.x > 0);
}

function getChainPoints() {
    const chains = state.detailData?.chains || [];
    const pcNodes = window.__pcNodes;
    if (!pcNodes) return [];

    return chains.map(c => {
        const nodes = pcNodes.get(c.id);
        if (!nodes || nodes.length < 2) return null;
        let arc = 0;
        for (let i = 1; i < nodes.length; i++) {
            arc += Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y);
        }
        return {
            x: c.bpSpan || 0,
            y: arc,
            label: c.id,
            lf: nodes[0].loopFactor || 0,
        };
    }).filter(p => p && p.x > 0 && p.y > 0);
}

function getLinkPoints() {
    const chains = state.detailData?.chains || [];
    const pcNodes = window.__pcNodes;
    if (!pcNodes) return [];

    const points = [];
    for (const c of chains) {
        const nodes = pcNodes.get(c.id);
        if (!nodes || nodes.length < 2) continue;
        const bpPerLink = (c.bpSpan || 0) / (nodes.length - 1);
        if (bpPerLink <= 0) continue;
        for (let i = 1; i < nodes.length; i++) {
            const canvasLen = Math.hypot(
                nodes[i].x - nodes[i - 1].x,
                nodes[i].y - nodes[i - 1].y);
            points.push({ x: bpPerLink, y: canvasLen, label: c.id });
        }
    }
    return points;
}

// ---------------------------------------------------------------
// Canvas scatter rendering (light mode)
// ---------------------------------------------------------------

function formatSI(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return v.toFixed(0);
}

function niceRange(min, max) {
    const pad = (max - min) * 0.08 || 1;
    return [Math.max(0, min - pad), max + pad];
}

function drawScatter(points, xLabel, yLabel, colorByLf) {
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const ml = 60, mr = 14, mt = 14, mb = 40;
    const pw = w - ml - mr;
    const ph = h - mt - mb;

    // Light background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    if (points.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data — zoom into detail view first', w / 2, h / 2);
        return;
    }

    // Data range
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of points) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
    }
    [xMin, xMax] = niceRange(xMin, xMax);
    [yMin, yMax] = niceRange(yMin, yMax);

    const toX = v => ml + (v - xMin) / (xMax - xMin) * pw;
    const toY = v => mt + ph - (v - yMin) / (yMax - yMin) * ph;

    // Grid
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#888';

    const nTicks = 5;
    ctx.textAlign = 'center';
    for (let i = 0; i <= nTicks; i++) {
        const xv = xMin + (xMax - xMin) * i / nTicks;
        const sx = toX(xv);
        ctx.beginPath(); ctx.moveTo(sx, mt); ctx.lineTo(sx, mt + ph); ctx.stroke();
        ctx.fillText(formatSI(xv), sx, mt + ph + 14);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= nTicks; i++) {
        const yv = yMin + (yMax - yMin) * i / nTicks;
        const sy = toY(yv);
        ctx.beginPath(); ctx.moveTo(ml, sy); ctx.lineTo(ml + pw, sy); ctx.stroke();
        ctx.fillText(formatSI(yv), ml - 5, sy + 3);
    }

    // Axis border
    ctx.strokeStyle = '#bbb';
    ctx.strokeRect(ml, mt, pw, ph);

    // Axis labels
    ctx.fillStyle = '#444';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, ml + pw / 2, h - 4);
    ctx.save();
    ctx.translate(12, mt + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Dots
    ctx.globalAlpha = 0.65;
    for (const p of points) {
        const sx = toX(p.x);
        const sy = toY(p.y);
        if (sx < ml || sx > ml + pw || sy < mt || sy > mt + ph) continue;

        if (colorByLf && p.lf != null) {
            const lf = p.lf;
            const r = Math.round(Math.min(1, lf * 2) * 255);
            const g = Math.round(lf < 0.5 ? lf * 2 * 200 : (1 - (lf - 0.5) * 2) * 200);
            const b = Math.round(Math.max(0, 1 - lf * 2) * 255);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
            ctx.fillStyle = '#2266cc';
        }
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Store screen positions for hover hit-test
    lastScreenPoints = points.map(p => ({
        sx: toX(p.x), sy: toY(p.y),
        label: p.label, x: p.x, y: p.y,
    }));

    // Point count
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`n=${points.length}`, ml + pw - 4, mt + 12);
}

function render() {
    if (activeTab === 'nodes') {
        drawScatter(getNodeCountPoints(), 'BP Length', 'Node Count', true);
    } else if (activeTab === 'chains') {
        drawScatter(getChainPoints(), 'BP Length', 'Arc Length (graph units)', true);
    } else {
        drawScatter(getLinkPoints(), 'BP per Link (uniform)', 'Link Canvas Length', false);
    }
}

// ---------------------------------------------------------------
// Draggable panel (self-contained, no external CSS)
// ---------------------------------------------------------------

function buildPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.style.cssText = `
        display: none; position: fixed; z-index: 10000;
        top: 60px; left: 60px; width: 480px; height: 360px;
        background: #fff; border: 1px solid #ccc; border-radius: 6px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        font-family: sans-serif; font-size: 12px;
        display: none; flex-direction: column; overflow: hidden;
    `;

    // Title bar (draggable)
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 10px; background: #f0f0f0; border-bottom: 1px solid #ddd;
        cursor: grab; user-select: none; flex-shrink: 0;
    `;
    titleBar.innerHTML = `
        <div style="display:flex; gap:6px; align-items:center;">
            <span style="font-weight:600; color:#333;">Scatterplot</span>
            <button class="scatter-tab" data-tab="nodes"
                style="padding:2px 8px; border:1px solid #ccc; border-radius:3px;
                       background:#e0e0e0; cursor:pointer; font-size:11px;">Nodes</button>
            <button class="scatter-tab" data-tab="chains"
                style="padding:2px 8px; border:1px solid #ccc; border-radius:3px;
                       background:#fff; cursor:pointer; font-size:11px;">Chains</button>
            <button class="scatter-tab" data-tab="links"
                style="padding:2px 8px; border:1px solid #ccc; border-radius:3px;
                       background:#fff; cursor:pointer; font-size:11px;">Links</button>
        </div>
        <span id="scatter-close" style="cursor:pointer; color:#888; font-size:18px;
              line-height:1; padding:0 2px;">&times;</span>
    `;
    panel.appendChild(titleBar);

    // Canvas
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'flex: 1; width: 100%;';
    panel.appendChild(canvas);
    ctx = canvas.getContext('2d');

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        display: none; position: absolute; z-index: 1;
        background: rgba(0,0,0,0.8); color: #fff; padding: 3px 7px;
        border-radius: 3px; font-size: 11px; pointer-events: none;
        white-space: nowrap;
    `;
    panel.appendChild(tooltip);

    document.body.appendChild(panel);

    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const mx = (e.clientX - rect.left);
        const my = (e.clientY - rect.top);
        let best = null, bestDist = 12;
        for (const p of lastScreenPoints) {
            const d = Math.hypot(p.sx - mx, p.sy - my);
            if (d < bestDist) { bestDist = d; best = p; }
        }
        if (best) {
            tooltip.style.display = '';
            tooltip.style.left = (e.clientX - panel.offsetLeft + 10) + 'px';
            tooltip.style.top = (e.clientY - panel.offsetTop - 20) + 'px';
            tooltip.textContent = `${best.label}  x=${formatSI(best.x)}  y=${formatSI(best.y)}`;
        } else {
            tooltip.style.display = 'none';
        }
    });
    canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

    // Tab switching
    const tabs = panel.querySelectorAll('.scatter-tab');
    for (const btn of tabs) {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            for (const b of tabs) b.style.background = '#fff';
            btn.style.background = '#e0e0e0';
            activeTab = btn.dataset.tab;
            render();
        });
    }
    // Set initial active
    tabs[0].style.background = '#e0e0e0';

    // Close
    panel.querySelector('#scatter-close').addEventListener('click', close);
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && isOpen()) close();
    });

    // Drag
    let dragging = false, dx = 0, dy = 0;
    titleBar.addEventListener('mousedown', e => {
        dragging = true;
        dx = e.clientX - panel.offsetLeft;
        dy = e.clientY - panel.offsetTop;
        titleBar.style.cursor = 'grabbing';
        e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        panel.style.left = (e.clientX - dx) + 'px';
        panel.style.top = (e.clientY - dy) + 'px';
    });
    window.addEventListener('mouseup', () => {
        dragging = false;
        titleBar.style.cursor = 'grab';
    });
}

function open() {
    buildPanel();
    panel.style.display = 'flex';
    requestAnimationFrame(render);
    if (!refreshInterval) refreshInterval = setInterval(render, 2000);
}

function close() {
    if (panel) panel.style.display = 'none';
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

function isOpen() {
    return panel && panel.style.display === 'flex';
}

// ---------------------------------------------------------------
// Public setup
// ---------------------------------------------------------------

export function setupDebugScatterplot() {
    const btn = document.createElement('button');
    btn.id = 'scatter-btn';
    btn.innerHTML = '<i class="fa-solid fa-chart-simple"></i>';
    btn.title = 'Chain Scatterplot';
    btn.style.cssText = `
        display: none; position: fixed; bottom: 16px; right: 64px;
        z-index: 9999; width: 40px; height: 40px; border-radius: 50%;
        border: none; cursor: pointer; background: var(--darker-green);
        color: var(--lighter-green); font-size: 16px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition: background 0.2s;
    `;
    btn.addEventListener('click', () => isOpen() ? close() : open());
    document.body.appendChild(btn);

    if (isDebugMode()) btn.style.display = '';
    eventBus.subscribe('app:debug-mode-changed', enabled => {
        btn.style.display = enabled ? '' : 'none';
        if (!enabled) close();
    });
}
