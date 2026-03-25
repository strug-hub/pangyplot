// Gene-colored overdraw on skeleton polylines, plus label positioning.

import { state } from '../../simplify-state.js';
import { getLevelBboxes } from '../data/skeleton-data.js';
import { getGenePins, isGeneVisible, isGeneStarred } from '../data/gene-data.js';
import { strokePolylines } from './skeleton-painter.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import { getPolychainPositions } from '../../detail/data/polychain/polychain-adapter.js';
import { createBlendGroup, drawGeneLabelSvg } from '../../render/simplify-svg-utils.js';
import { hexToRgba } from '@color-utils';

// Persistent map: gene name → current animated dodge offset (screen px above default).
// Survives across frames so we can lerp toward the target.
const animatedOffset = new Map();

// Set of gene names that passed density culling last frame.
// Used by drawGenePolylines to skip coloring non-pinned genes.
const pinnedGenes = new Set();

// Precomputed spatial index: gene name → polyline indices.
// Viewport-independent — rebuilt only when LOD or gene positions change.
// Canvas clips off-screen polylines automatically.
let genePinVersion = 0;
let polylineCache = null;  // { lod, pinVer, data: Map<name, number[]> }

export function bumpGenePinVersion() { genePinVersion++; }

function buildPolylineIndex(level, bboxes) {
    if (polylineCache && polylineCache.lod === state.currentLOD &&
        polylineCache.pinVer === genePinVersion) {
        return polylineCache.data;
    }

    const genePins = getGenePins();
    const geneYMargin = (level.gridSize || 50) * 3;
    const data = new Map();

    for (const gene of genePins) {
        if (!isGeneVisible(gene.name)) continue;
        if (!pinnedGenes.has(gene.name)) continue;
        const indices = [];
        for (let i = 0; i < level.polylines.length; i++) {
            const o = i * 4;
            if (bboxes[o+2] >= gene.startX && bboxes[o] <= gene.endX &&
                bboxes[o+3] >= gene.minY - geneYMargin && bboxes[o+1] <= gene.maxY + geneYMargin) {
                indices.push(i);
            }
        }
        if (indices.length > 0) data.set(gene.name, indices);
    }

    polylineCache = { lod: state.currentLOD, pinVer: genePinVersion, data };
    return data;
}

/**
 * Draw gene-colored polyline overdraw on visible skeleton polylines.
 * Each gene uses its own color.
 */
export function drawGenePolylines(ctx, level, lineWidth, skelAlpha, vpMinX, vpMinY, vpMaxX, vpMaxY, svg = null) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const bboxes = getLevelBboxes();
    const index = buildPolylineIndex(level, bboxes);
    if (index.size === 0) return;

    let target = svg;
    if (svg) {
        target = createBlendGroup(svg, 'multiply');
    } else {
        var prevComp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'multiply';
    }

    for (const gene of genePins) {
        const indices = index.get(gene.name);
        if (!indices) continue;
        strokePolylines(ctx, level.polylines, indices, hexToRgba(gene.color, skelAlpha), lineWidth * 1.5, target);
    }

    if (!svg) ctx.globalCompositeOperation = prevComp;
}

/**
 * Compute screen-space label positions and draw gene labels.
 * Density-based: evenly spaced labels across the viewport, culled by
 * minimum spacing rather than gene size. Labels avoid each other on the y-axis.
 * Brackets are drawn behind badges.
 */
export function drawGeneLabelOverlay(ctx, cw, svg = null) {
    const genePins = getGenePins();
    if (genePins.length === 0) return;

    const inDetail = state.detailPhase !== 'none';
    const fontSize = 11;
    const px = 5, py = 2;
    const badgeH = fontSize + py * 2;  // 15px
    const stemH = inDetail ? 0 : 16;   // no stem in detail mode
    const gap = 4;                      // space between bracket top and badge bottom
    const labelPad = 6;                 // vertical padding between stacked labels
    const chainClearance = 20;          // px clearance from chain polylines in detail mode

    ctx.font = `600 ${fontSize}px 'SF Mono', Consolas, monospace`;

    // In detail mode, collect screen-space chain segments for avoidance
    let chainScreenSegs = null;
    if (inDetail && state.detailData) {
        chainScreenSegs = [];
        for (const chain of state.detailData.chains) {
            const pl = getPolychainPositions(chain.id) || chain.polyline;
            if (!pl || pl.length < 2) continue;
            for (let i = 0; i < pl.length - 1; i++) {
                chainScreenSegs.push({
                    x1: pl[i][0] * state.zoom + state.panX,
                    y1: pl[i][1] * state.zoom + state.panY,
                    x2: pl[i + 1][0] * state.zoom + state.panX,
                    y2: pl[i + 1][1] * state.zoom + state.panY,
                });
            }
        }
    }

    // Build all visible candidates (just off-screen culling, no size filter)
    const allVisible = [];
    for (const gene of genePins) {
        if (!isGeneVisible(gene.name)) continue;
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

    // Density-based culling: starred genes get placed first (guaranteed slots),
    // then remaining genes fill gaps with minimum spacing.
    const minSpacing = 20;
    const candidates = [];

    // Pass 1: place starred genes unconditionally
    const starredSlots = [];  // sorted x positions of accepted starred genes
    for (const c of allVisible) {
        if (isGeneStarred(c.gene.name)) {
            candidates.push(c);
            starredSlots.push(c.sxMid);
        }
    }
    starredSlots.sort((a, b) => a - b);

    // Pass 2: fill remaining slots respecting spacing from all accepted genes
    const acceptedXs = [...starredSlots];
    for (const c of allVisible) {
        if (isGeneStarred(c.gene.name)) continue;
        // Check spacing against all accepted positions
        let tooClose = false;
        for (const ax of acceptedXs) {
            if (Math.abs(c.sxMid - ax) < minSpacing) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            candidates.push(c);
            acceptedXs.push(c.sxMid);
        }
    }

    // Re-sort candidates by screen x for collision avoidance
    candidates.sort((a, b) => a.sxMid - b.sxMid);

    // Update pinned set so coloring functions only highlight genes with labels.
    pinnedGenes.clear();
    for (const c of candidates) {
        pinnedGenes.add(c.gene.name);
    }

    // Y-axis collision avoidance: nudge overlapping labels upward.
    const xMargin = 8;
    const placed = [];
    for (const c of candidates) {
        const cx1 = c.sxMid - c.badgeW / 2 - xMargin;
        const cx2 = c.sxMid + c.badgeW / 2 + xMargin;
        let top = c.badgeTop;

        // In detail mode, also avoid chain polylines
        if (chainScreenSegs) {
            let chainConflict = true;
            let iterations = 0;
            while (chainConflict && iterations < 20) {
                chainConflict = false;
                iterations++;
                const badgeBottom = top + badgeH;
                for (const seg of chainScreenSegs) {
                    const segMinX = Math.min(seg.x1, seg.x2);
                    const segMaxX = Math.max(seg.x1, seg.x2);
                    if (segMaxX < cx1 || segMinX > cx2) continue;

                    const segMinY = Math.min(seg.y1, seg.y2);
                    const segMaxY = Math.max(seg.y1, seg.y2);
                    if (badgeBottom + chainClearance > segMinY && top - chainClearance < segMaxY) {
                        top = segMinY - badgeH - chainClearance;
                        chainConflict = true;
                        break;
                    }
                }
            }
        }

        // Keep nudging until clear of all conflicting placed labels
        let conflict = true;
        let nudges = 0;
        while (conflict && nudges < 20) {
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
            nudges++;
        }

        // Dodge offset = how far above default position
        const defaultTop = c.badgeTop;
        const targetOffset = top - defaultTop;

        if (svg) {
            // SVG export: use target positions directly (no animation)
            c.badgeTop = defaultTop + targetOffset;
        } else {
            // Canvas: lerp the offset for smooth animation
            const prevOffset = animatedOffset.get(c.gene.name);
            let curOffset;
            if (prevOffset !== undefined) {
                curOffset = prevOffset + (targetOffset - prevOffset) * 0.12;
                if (Math.abs(targetOffset - curOffset) > 0.5) {
                    scheduleFrame();
                }
            } else {
                curOffset = targetOffset;
            }
            animatedOffset.set(c.gene.name, curOffset);
            c.badgeTop = defaultTop + curOffset;
        }

        placed.push({ left: cx1, right: cx2, top });
    }

    if (svg) {
        // SVG path: build label elements directly
        const showStem = !inDetail;
        for (const c of candidates) {
            drawGeneLabelSvg(svg, c.gene.name, c.sxMid,
                c.badgeTop, badgeH, c.badgeW, c.syRef, c.gene.color, showStem);
        }
        return;
    }

    // Pass 1: draw bracket stems (skeleton mode only)
    if (!inDetail) {
        ctx.lineWidth = 1.5;
        for (const c of candidates) {
            const bracketY = c.badgeTop + badgeH + gap;
            ctx.strokeStyle = c.gene.color;
            ctx.beginPath();
            ctx.moveTo(c.sxMid, c.syRef + 4);
            ctx.lineTo(c.sxMid, bracketY);
            ctx.stroke();
        }
    }

    // Pass 2: draw all badge backgrounds + text
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
    pinnedGenes.clear();
    polylineCache = null;
    junctionCache = null;
}