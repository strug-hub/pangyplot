// Debug view: gap pressure visualization.
// For each popped bubble gap, draws the spine axis (dotted) and a
// perpendicular arrow showing average displacement of popped nodes
// from the axis — a measure of compression/overflow.

import { state } from '../../simplify-state.js';
import { registerView } from '../debug-orchestrator.js';
import { getForceNodes } from '../../detail/data/force-data.js';
import { getContainer } from '../../detail/model/model-manager.js';

registerView({
    key: 'KeyG',
    keyLabel: 'G',
    label: 'Gap Pressure',

    draw(ctx) {
        const dd = state.detailData;
        if (!dd) return;
        const opacity = state.detailOpacity;
        const allNodes = getForceNodes();

        // Index popped nodes by bubbleId for fast lookup
        const nodesByBubble = new Map();
        for (const n of allNodes) {
            if (!n.popBubbleId || n.x == null) continue;
            if (!nodesByBubble.has(n.popBubbleId)) nodesByBubble.set(n.popBubbleId, []);
            nodesByBubble.get(n.popBubbleId).push(n);
        }
        if (nodesByBubble.size === 0) return;

        const lw = Math.max(0.5, 1.5 / state.zoom);
        const dashLen = Math.max(3, 6 / state.zoom);
        const fontSize = Math.max(6, 14 / state.zoom);
        const headLen = Math.max(3, 6 / state.zoom);

        for (const chain of dd.chains) {
            const container = getContainer(chain.id);
            if (!container || container.poppedRanges.length === 0) continue;
            const spine = container.spineNodes;
            if (spine.length < 2) continue;

            for (const pr of container.poppedRanges) {
                const poppedNodes = nodesByBubble.get(pr.bubbleId);
                if (!poppedNodes || poppedNodes.length === 0) continue;

                // Find the gap boundaries from neighboring segments' t-ranges.
                // The gap is between the left segment's tRange.end and the
                // right segment's tRange.start.
                const segs = container.segments;
                let gapStart = pr.tStart;
                let gapEnd = pr.tEnd;
                for (const seg of segs) {
                    if (seg.tRange.end <= pr.tStart && seg.tRange.end > gapStart) {
                        gapStart = seg.tRange.end;
                    }
                    if (seg.tRange.start >= pr.tEnd && (gapEnd === pr.tEnd || seg.tRange.start < gapEnd)) {
                        gapEnd = seg.tRange.start;
                    }
                }
                const A = container.positionAt(gapStart);
                const B = container.positionAt(gapEnd);

                // Axis vector
                const ax = B.x - A.x;
                const ay = B.y - A.y;
                const axLen = Math.hypot(ax, ay);
                if (axLen < 0.001) continue;

                // Unit normal (perpendicular to axis)
                const nx = -ay / axLen;
                const ny = ax / axLen;

                // Project each popped node onto axis, measure perpendicular
                let sumAbsPerp = 0;
                let sumSignedPerp = 0;
                let maxAbsPerp = 0;
                for (const n of poppedNodes) {
                    const dx = n.x - A.x;
                    const dy = n.y - A.y;
                    const perp = dx * nx + dy * ny; // signed perpendicular
                    sumAbsPerp += Math.abs(perp);
                    sumSignedPerp += perp;
                    if (Math.abs(perp) > maxAbsPerp) maxAbsPerp = Math.abs(perp);
                }
                const avgPerp = sumAbsPerp / poppedNodes.length;
                const netSign = sumSignedPerp >= 0 ? 1 : -1;

                // --- Draw ---

                // 1. Dotted axis line A→B
                ctx.globalAlpha = 0.5 * opacity;
                ctx.strokeStyle = '#FFaa00';
                ctx.lineWidth = lw;
                ctx.setLineDash([dashLen, dashLen]);
                ctx.beginPath();
                ctx.moveTo(A.x, A.y);
                ctx.lineTo(B.x, B.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // 2. Perpendicular arrow from midpoint
                const mx = (A.x + B.x) / 2;
                const my = (A.y + B.y) / 2;
                const arrowDx = nx * netSign * avgPerp;
                const arrowDy = ny * netSign * avgPerp;
                const ex = mx + arrowDx;
                const ey = my + arrowDy;

                ctx.globalAlpha = 0.8 * opacity;
                ctx.strokeStyle = '#FF4444';
                ctx.lineWidth = lw * 2;
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                // Arrowhead
                if (avgPerp > 1) {
                    const angle = Math.atan2(arrowDy, arrowDx);
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
                    ctx.stroke();
                }

                // 3. Label
                ctx.globalAlpha = 0.9 * opacity;
                ctx.fillStyle = '#FF4444';
                ctx.font = `${fontSize}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const labelX = ex + nx * netSign * fontSize * 0.8;
                const labelY = ey + ny * netSign * fontSize * 0.8;
                ctx.fillText(avgPerp.toFixed(1), labelX, labelY);

                // Small count label
                ctx.fillStyle = '#aaa';
                ctx.font = `${fontSize * 0.7}px monospace`;
                ctx.textBaseline = 'top';
                ctx.fillText(`n=${poppedNodes.length}`, labelX, labelY);
            }
        }

        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
    },
});
