// Gene-colored overdraw on skeleton polylines and junctions, plus label positioning.

import { state } from '../../simplify-state.js';
import { getLevelBboxes } from '../data/skeleton-data.js';
import { getGenePins } from '../data/gene-data.js';
import { strokePolylines, fillJunctions, drawGeneLabel } from './skeleton-painter.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';

// Persistent map: gene name → current animated dodge offset (screen px above default).
// Survives across frames so we can lerp toward the target.
const animatedOffset = new Map();

/**
 * Draw gene-colored polyline overdraw on visible skeleton polylines.
 * Each gene uses its own color.
 */
export function drawGenePolylines(ctx, level, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const bboxes = getLevelBboxes();
    const geneYMargin = (level.gridSize || 50) * 3;

    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'multiply';

    for (const gene of genePins) {
        const indices = [];
        for (let i = 0; i < level.polylines.length; i++) {
            const o = i * 4;
            if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
                bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;

            if (bboxes[o+2] >= gene.startX && bboxes[o] <= gene.endX &&
                bboxes[o+3] >= gene.minY - geneYMargin && bboxes[o+1] <= gene.maxY + geneYMargin) {
                indices.push(i);
            }
        }
        if (indices.length > 0) {
            strokePolylines(ctx, level.polylines, indices, hexToRgba(gene.color, skelAlpha), lineWidth * 1.5);
        }
    }

    ctx.globalCompositeOperation = prevComp;
}

/**
 * Draw gene-colored junction overdraw on visible skeleton junctions.
 */
export function drawGeneJunctions(ctx, level, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const geneYMargin = (level.gridSize || 50) * 3;
    const gr = Math.max(2, 4.0 / state.zoom);

    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'multiply';

    for (const gene of genePins) {
        const junctions = [];
        for (const [x, y] of level.junctions) {
            if (x < vpMinX || x > vpMaxX || y < vpMinY || y > vpMaxY) continue;
            if (x >= gene.startX && x <= gene.endX &&
                y >= gene.minY - geneYMargin && y <= gene.maxY + geneYMargin) {
                junctions.push([x, y]);
            }
        }
        if (junctions.length > 0) {
            fillJunctions(ctx, junctions, gr, hexToRgba(gene.color, skelAlpha));
        }
    }

    ctx.globalCompositeOperation = prevComp;
}

/**
 * Compute screen-space label positions and draw gene labels.
 * Density-based: evenly spaced labels across the viewport, culled by
 * minimum spacing rather than gene size. Labels avoid each other on the y-axis.
 * Brackets are drawn behind badges.
 */
export function drawGeneLabelOverlay(ctx, cw) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const fontSize = 11;
    const px = 5, py = 2;
    const badgeH = fontSize + py * 2;  // 15px
    const stemH = 16;                   // bracket stem height
    const gap = 4;                      // space between bracket top and badge bottom
    const labelPad = 6;                 // vertical padding between stacked labels

    ctx.font = `600 ${fontSize}px 'SF Mono', Consolas, monospace`;

    // Build all visible candidates (just off-screen culling, no size filter)
    const allVisible = [];
    for (const gene of genePins) {
        const sxStart = gene.startX * state.zoom + state.panX;
        const sxEnd = gene.endX * state.zoom + state.panX;
        if (sxEnd < -80 || sxStart > cw + 80) continue;
        const sxMid = (sxStart + sxEnd) / 2;
        const syRef = gene.refY * state.zoom + state.panY;
        const tw = ctx.measureText(gene.name).width;
        const badgeW = tw + px * 2;
        allVisible.push({
            gene, sxStart, sxEnd, sxMid, syRef, badgeW,
            badgeTop: syRef - stemH - gap - badgeH,
        });
    }

    // Sort by screen x
    allVisible.sort((a, b) => a.sxMid - b.sxMid);

    // Density-based culling: enforce minimum horizontal spacing between labels.
    // At any zoom level, labels must be at least minSpacing px apart (center-to-center).
    const minSpacing = 10;
    const candidates = [];
    let lastAcceptedX = -Infinity;
    for (const c of allVisible) {
        if (c.sxMid - lastAcceptedX >= minSpacing) {
            candidates.push(c);
            lastAcceptedX = c.sxMid;
        }
    }

    // Y-axis collision avoidance: nudge overlapping labels upward.
    // Use generous x-margin so nearby (not just overlapping) labels dodge too.
    const xMargin = 8;
    const placed = [];
    for (const c of candidates) {
        const cx1 = c.sxMid - c.badgeW / 2 - xMargin;
        const cx2 = c.sxMid + c.badgeW / 2 + xMargin;
        let top = c.badgeTop;

        // Keep nudging until clear of all conflicting placed labels
        let conflict = true;
        while (conflict) {
            conflict = false;
            for (let i = placed.length - 1; i >= 0; i--) {
                const p = placed[i];
                if (p.right < cx1 || p.left > cx2) continue;
                const pBottom = p.top + badgeH;
                if (top < pBottom + labelPad && top + badgeH > p.top - labelPad) {
                    top = p.top - badgeH - labelPad;
                    conflict = true;
                }
            }
        }

        // Dodge offset = how far above default position
        const defaultTop = c.badgeTop;
        const targetOffset = top - defaultTop;

        // Lerp the offset, not the absolute position
        const prevOffset = animatedOffset.get(c.gene.name);
        let curOffset;
        if (prevOffset !== undefined) {
            curOffset = prevOffset + (targetOffset - prevOffset) * 0.12;
            // Keep animating if not settled
            if (Math.abs(targetOffset - curOffset) > 0.5) {
                scheduleFrame();
            }
        } else {
            curOffset = targetOffset;
        }
        animatedOffset.set(c.gene.name, curOffset);

        c.badgeTop = defaultTop + curOffset;
        // Use target for collision so dodging stays stable
        placed.push({ left: cx1, right: cx2, top });
    }

    // Pass 1: draw all bracket stems (behind badges)
    ctx.lineWidth = 1.5;
    for (const c of candidates) {
        const bracketY = c.badgeTop + badgeH + gap;
        ctx.strokeStyle = c.gene.color;
        ctx.beginPath();
        ctx.moveTo(c.sxMid, c.syRef + 4);
        ctx.lineTo(c.sxMid, bracketY);
        ctx.stroke();
    }

    // Pass 2: draw all badge backgrounds + text (on top of stems)
    ctx.font = `600 ${fontSize}px 'SF Mono', Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const c of candidates) {
        const tw = ctx.measureText(c.gene.name).width;
        const ly = c.badgeTop + badgeH;

        ctx.fillStyle = 'rgba(40, 32, 10, 0.85)';
        ctx.beginPath();
        ctx.roundRect(c.sxMid - tw / 2 - px, c.badgeTop, tw + px * 2, badgeH, 3);
        ctx.fill();

        ctx.fillStyle = c.gene.color;
        ctx.fillText(c.gene.name, c.sxMid, ly);
    }
}

/** Clear animated label positions (call on chromosome switch). */
export function clearLabelAnimation() {
    animatedOffset.clear();
}

/** Convert hex color (#rrggbb) to rgba string with given alpha. */
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
