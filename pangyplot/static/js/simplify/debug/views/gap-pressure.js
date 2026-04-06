// Debug view: gap pressure visualization.
// For each merged gap (contiguous uncovered t-range), measures how far
// popped nodes sit from the spine polyline — the actual curved path,
// not a straight chord. Draws the spine segment and a perpendicular
// arrow showing average displacement.

import { state } from '../../simplify-state.js';
import { registerView } from '../debug-orchestrator.js';
import { getForceNodes } from '../../detail/data/force-data.js';
import { getContainer } from '../../detail/model/model-manager.js';

/**
 * Find merged gaps: contiguous t-ranges not covered by any segment.
 * Returns [{tStart, tEnd, bubbleIds}].
 */
function findMergedGaps(container) {
    const segs = container.segments.slice().sort((a, b) => a.tRange.start - b.tRange.start);
    const gaps = [];

    let cursor = 0;
    for (const seg of segs) {
        if (seg.tRange.start > cursor + 0.0001) {
            gaps.push({ tStart: cursor, tEnd: seg.tRange.start });
        }
        cursor = Math.max(cursor, seg.tRange.end);
    }
    if (cursor < 1 - 0.0001) {
        gaps.push({ tStart: cursor, tEnd: 1 });
    }

    for (const gap of gaps) {
        gap.bubbleIds = [];
        for (const pr of container.poppedRanges) {
            if (pr.tStart >= gap.tStart - 0.0001 && pr.tEnd <= gap.tEnd + 0.0001) {
                gap.bubbleIds.push(pr.bubbleId);
            }
        }
    }

    return gaps.filter(g => g.bubbleIds.length > 0);
}

/**
 * Project a point onto the nearest point on a polyline.
 * Returns { x, y, dist, perpSign } where perpSign indicates which side.
 */
function projectOntoPolyline(px, py, polyline) {
    let bestDist = Infinity;
    let bestX = 0, bestY = 0;
    let bestSegDx = 0, bestSegDy = 0;

    for (let i = 0; i < polyline.length - 1; i++) {
        const ax = polyline[i][0], ay = polyline[i][1];
        const bx = polyline[i + 1][0], by = polyline[i + 1][1];
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        let t = 0;
        if (lenSq > 0) {
            t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        }
        const projX = ax + t * dx;
        const projY = ay + t * dy;
        const d = Math.hypot(px - projX, py - projY);
        if (d < bestDist) {
            bestDist = d;
            bestX = projX;
            bestY = projY;
            bestSegDx = dx;
            bestSegDy = dy;
        }
    }

    // Determine which side of the segment the point is on
    const segLen = Math.hypot(bestSegDx, bestSegDy) || 1;
    const nx = -bestSegDy / segLen;
    const ny = bestSegDx / segLen;
    const perpSign = ((px - bestX) * nx + (py - bestY) * ny) >= 0 ? 1 : -1;

    return { x: bestX, y: bestY, dist: bestDist, perpSign };
}

registerView({
    key: 'KeyG',
    keyLabel: 'G',
    label: 'Gap Pressure',

    draw(ctx) {
        const dd = state.detailData;
        if (!dd) return;
        const opacity = state.detailOpacity;
        const allNodes = getForceNodes();

        // Index popped nodes by bubbleId
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
            if (container.spineNodes.length < 2) continue;

            const gaps = findMergedGaps(container);

            // Build spine polyline from live positions
            const spinePl = container.spineNodes.map(n => [n.x, n.y]);

            for (const gap of gaps) {
                // Collect all popped nodes in this merged gap
                const gapNodes = [];
                for (const bid of gap.bubbleIds) {
                    const nodes = nodesByBubble.get(bid);
                    if (nodes) gapNodes.push(...nodes);
                }
                if (gapNodes.length === 0) continue;

                // Get the spine polyline segment for this gap's t-range
                const gapPl = container.polylineInRange(gap.tStart, gap.tEnd);
                const targetPl = gapPl.length >= 2 ? gapPl : spinePl;

                // Measure perpendicular distance from spine for each node
                let sumDist = 0;
                let maxDist = 0;
                let sumSignedNx = 0, sumSignedNy = 0;
                let maxNode = null;

                for (const n of gapNodes) {
                    const proj = projectOntoPolyline(n.x, n.y, targetPl);
                    sumDist += proj.dist;
                    if (proj.dist > maxDist) {
                        maxDist = proj.dist;
                        maxNode = n;
                    }
                    // Accumulate displacement direction
                    if (proj.dist > 0.01) {
                        const dx = n.x - proj.x;
                        const dy = n.y - proj.y;
                        sumSignedNx += dx / proj.dist * proj.dist;
                        sumSignedNy += dy / proj.dist * proj.dist;
                    }
                }
                const avgDist = sumDist / gapNodes.length;

                // --- Draw ---

                // 1. Dotted spine polyline through the gap
                ctx.globalAlpha = 0.5 * opacity;
                ctx.strokeStyle = '#FFaa00';
                ctx.lineWidth = lw;
                ctx.setLineDash([dashLen, dashLen]);
                ctx.beginPath();
                if (targetPl.length >= 2) {
                    ctx.moveTo(targetPl[0][0], targetPl[0][1]);
                    for (let i = 1; i < targetPl.length; i++) {
                        ctx.lineTo(targetPl[i][0], targetPl[i][1]);
                    }
                }
                ctx.stroke();
                ctx.setLineDash([]);

                // 2. Arrow from spine midpoint in the net displacement direction
                const midIdx = Math.floor(targetPl.length / 2);
                const mx = targetPl[midIdx]?.[0] ?? 0;
                const my = targetPl[midIdx]?.[1] ?? 0;

                const netLen = Math.hypot(sumSignedNx, sumSignedNy);
                if (netLen > 0.01) {
                    const ux = sumSignedNx / netLen;
                    const uy = sumSignedNy / netLen;
                    const arrowLen = avgDist;
                    const ex = mx + ux * arrowLen;
                    const ey = my + uy * arrowLen;

                    ctx.globalAlpha = 0.8 * opacity;
                    ctx.strokeStyle = '#FF4444';
                    ctx.lineWidth = lw * 2;
                    ctx.beginPath();
                    ctx.moveTo(mx, my);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();

                    // Arrowhead
                    if (arrowLen > 1) {
                        const angle = Math.atan2(uy, ux);
                        ctx.beginPath();
                        ctx.moveTo(ex, ey);
                        ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
                        ctx.moveTo(ex, ey);
                        ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
                        ctx.stroke();
                    }

                    // 3. Labels
                    ctx.globalAlpha = 0.9 * opacity;
                    ctx.fillStyle = '#FF4444';
                    ctx.font = `${fontSize}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    const labelX = ex + ux * fontSize * 0.8;
                    const labelY = ey + uy * fontSize * 0.8;
                    ctx.fillText(`avg:${avgDist.toFixed(1)} max:${maxDist.toFixed(1)}`, labelX, labelY);

                    ctx.fillStyle = '#aaa';
                    ctx.font = `${fontSize * 0.7}px monospace`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(`n=${gapNodes.length} b=${gap.bubbleIds.length}`, labelX, labelY);
                }
            }
        }

        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
    },
});
