// Physics debug overlay: renders chain activation depths and HUD panel.

import { state } from '../../simplify-state.js';
import { getActivationSet } from '../../engines/physics-activation-engine.js';

const DEPTH_COLORS = [
    '#00ffff',  // depth 0 (seed) -- cyan
    '#4488ff',  // depth 1 -- blue
    '#8844ff',  // depth 2 -- purple
    '#cc44ff',  // depth 3+ -- magenta
];

export function drawPhysicsDebugOverlay(ctx, viewport) {
    const activationSet = getActivationSet();
    if (!activationSet || !state.detailData) return;

    const { seed, activated } = activationSet;
    const chains = state.detailData.chains;
    const baseWidth = Math.max(1.5, 3 / state.zoom);

    for (const chain of chains) {
        if (activated.has(chain.id)) continue;
        const pl = chain.polyline;
        if (!pl || pl.length < 2) continue;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = baseWidth;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) {
            ctx.lineTo(pl[i][0], pl[i][1]);
        }
        ctx.stroke();
    }

    for (const chain of chains) {
        const info = activated.get(chain.id);
        if (!info) continue;
        const pl = chain.polyline;
        if (!pl || pl.length < 2) continue;

        const colorIdx = Math.min(info.depth, DEPTH_COLORS.length - 1);
        const color = DEPTH_COLORS[colorIdx];
        const width = info.depth === 0 ? baseWidth * 3 : baseWidth * 2;

        if (info.popped) {
            ctx.setLineDash([]);
        } else {
            const dash = Math.max(3, 6 / state.zoom);
            ctx.setLineDash([dash, dash]);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) {
            ctx.lineTo(pl[i][0], pl[i][1]);
        }
        ctx.stroke();

        if (chain.id === seed) {
            ctx.strokeStyle = color;
            ctx.lineWidth = width * 2;
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let i = 1; i < pl.length; i++) {
                ctx.lineTo(pl[i][0], pl[i][1]);
            }
            ctx.stroke();
        }
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const cx = (viewport.minX + viewport.maxX) / 2;
    const cy = (viewport.minY + viewport.maxY) / 2;
    const armLen = Math.max(5, 10 / state.zoom);

    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = Math.max(1, 2 / state.zoom);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - armLen, cy);
    ctx.lineTo(cx + armLen, cy);
    ctx.moveTo(cx, cy - armLen);
    ctx.lineTo(cx, cy + armLen);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

export function drawPhysicsDebugHUD(ctx, cw) {
    const activationSet = getActivationSet();
    if (!activationSet || !state.detailData) return;

    const { seed, activated, totalClippedCost, totalFullCost, budget } = activationSet;
    const totalChains = state.detailData.chains.length;

    const lines = [
        'PHYSICS ZONE  [L]',
        `seed: ${seed}`,
        `chains: ${activated.size} / ${totalChains}`,
        `est. nodes: ${totalClippedCost} / ${budget}`,
        `full cost:  ${totalFullCost}`,
    ];

    const fontSize = 11;
    const lineHeight = 16;
    const padding = 8;
    const x = cw - 220;
    const y = 10;
    const boxW = 210;
    const boxH = padding * 2 + lines.length * lineHeight + 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 4);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 4);
    ctx.stroke();

    ctx.font = `600 ${fontSize}px 'SF Mono', Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i === 0 ? '#00ffff' : '#ccc';
        ctx.fillText(lines[i], x + padding, y + padding + i * lineHeight);
    }

    const legendY = y + padding + lines.length * lineHeight + 4;
    const labels = ['0', '1', '2', '3+'];
    let lx = x + padding;
    for (let i = 0; i < DEPTH_COLORS.length; i++) {
        ctx.fillStyle = DEPTH_COLORS[i];
        ctx.beginPath();
        ctx.arc(lx + 5, legendY + 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#999';
        ctx.fillText(labels[i], lx + 12, legendY);
        lx += 40;
    }
}
