// Debug view: hover hit-test zone overlay.
// H to toggle. Self-contained — pulls data from force-data, model-manager.

import { state } from '../../state.js';
import { registerView } from '../debug-orchestrator.js';
import { getContainer } from '../../detail/model/model-manager.js';
import { getForceNodes } from '../../detail/data/force-data.js';
import { getRenderScale } from '../../detail/engines/forces/pc-settings.js';
import { rx, ry } from '../../render/render-offset.js';

const HIT_RADIUS_PX = 12;

registerView({
    key: 'KeyH',
    keyLabel: 'H',
    label: 'Hit Zones',

    draw(ctx) {
        drawHitZones(ctx);
    },
});

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------

function getChainPolyline(chainId) {
    const container = getContainer(chainId);
    if (container) {
        const points = [];
        for (const seg of container.segments) {
            for (const p of seg.getPolyline()) points.push(p);
        }
        if (points.length >= 2) return points;
        if (container.spineNodes?.length >= 2) {
            return container.spineNodes.map(n => [n.x, n.y]);
        }
    }
    return null;
}

function drawHitZones(ctx) {
    if (!state.detailData) return;
    const RS = getRenderScale();
    const hitR = HIT_RADIUS_PX * RS / state.zoom;

    // --- Chain polylines (blue) ---
    ctx.save();
    ctx.strokeStyle = 'rgba(91, 184, 240, 0.15)';
    ctx.lineWidth = hitR * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const chain of state.detailData.chains) {
        const container = getContainer(chain.id);
        if (container && container.segments.length === 0) continue;
        const pl = getChainPolyline(chain.id) || chain.polyline;
        if (!pl || pl.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(rx(pl[0][0]), ry(pl[0][1]));
        for (let i = 1; i < pl.length; i++) ctx.lineTo(rx(pl[i][0]), ry(pl[i][1]));
        ctx.stroke();
    }
    ctx.restore();

    // --- Force nodes (pink) ---
    ctx.save();
    ctx.fillStyle = 'rgba(250, 179, 174, 0.2)';
    const nodes = getForceNodes();
    for (const node of nodes) {
        if (node.isPolychainNode || node.isAnchor) continue;
        if (node.x == null) continue;
        const nodeR = (node.width || 6) / (2 * state.zoom);
        const r = Math.max(nodeR, hitR);
        ctx.beginPath();
        ctx.arc(rx(node.x), ry(node.y), r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // --- Bubble circles (green) ---
    ctx.save();
    ctx.fillStyle = 'rgba(144, 238, 144, 0.2)';
    for (const chain of state.detailData.chains) {
        const container = getContainer(chain.id);
        if (!container) continue;
        for (const seg of container.segments) {
            const circles = seg._lastBubbleCircles;
            if (!circles) continue;
            for (const b of circles) {
                ctx.beginPath();
                ctx.arc(rx(b.x), ry(b.y), hitR, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.restore();
}
