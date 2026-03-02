// Main canvas rendering: skeleton pass, detail pass, gene labels, stats.

import { state } from './simplify-state.js';
import { selectLevel } from './lod.js';
import { getViewport, viewportStepCount } from './viewport.js';
import { getGenePins } from './genes.js';
import { formatBp, subtypeColor } from './format-utils.js';
import { xToBp, getChromosome } from './spine.js';

let rafId = null;

// ---------------------------------------------------------------
// Detail bar DOM update (lives here to avoid render<->detail cycle)
// ---------------------------------------------------------------
export function updateDetailBar() {
    if (!state.detailData) return;
    state.dom.detailChains.textContent = state.detailData.chains.length.toLocaleString();
    state.dom.detailExposed.textContent = (state.detailData.bubbles ? state.detailData.bubbles.length : 0).toLocaleString();
    state.dom.detailNodes.textContent = (state.detailData.totalBubbles || 0).toLocaleString();
    if (state.detailCache) {
        state.dom.detailRange.textContent = `${formatBp(state.detailCache.bpStart)}-${formatBp(state.detailCache.bpEnd)}`;
    }
    state.dom.detailOpacity.textContent = state.detailOpacity.toFixed(2);
    const steps = viewportStepCount();
    state.dom.detailSteps.textContent = isFinite(steps) ? Math.round(steps).toLocaleString() : '--';
}

// ---------------------------------------------------------------
// Detail rendering helpers (within data-space transform)
// ---------------------------------------------------------------
function drawChainPolylines(chains, baseWidth, hovChain) {
    const ctx = state.ctx;
    for (const chain of chains) {
        const pl = chain.polyline;
        if (pl.length < 2) continue;
        const isHovered = hovChain && chain === hovChain;

        if (chain.connector) {
            // Connector: thin dashed line for leaf-bubble runs
            const dashLen = Math.max(4, 10 / state.zoom);
            ctx.setLineDash([dashLen, dashLen]);
            ctx.strokeStyle = '#888';
            ctx.lineWidth = Math.max(1, baseWidth * 0.6);
            ctx.globalAlpha = (hovChain && !isHovered ? 0.15 : 0.5) * state.detailOpacity;
        } else {
            // Regular chain: white by default (matches skeleton), blue on hover
            const w = Math.max(1.5, baseWidth * Math.log2(Math.max(2, chain.nBubbles)));
            ctx.setLineDash([]);
            ctx.strokeStyle = isHovered ? '#5bb8f0' : '#fff';
            ctx.lineWidth = isHovered ? w * 1.5 : w;
            if (hovChain && !isHovered) {
                ctx.globalAlpha = 0.25 * state.detailOpacity;
            } else if (isHovered) {
                ctx.globalAlpha = state.detailOpacity;
            } else {
                ctx.globalAlpha = 0.75 * state.detailOpacity;
            }
        }

        ctx.beginPath();
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) {
            ctx.lineTo(pl[i][0], pl[i][1]);
        }
        ctx.stroke();

        if (hovChain) {
            ctx.globalAlpha = state.detailOpacity;
        }
    }
    ctx.setLineDash([]);
}

function drawBubbleEllipses(bubbles, hovBubble) {
    const ctx = state.ctx;
    // Minimum radius in screen pixels so bubbles are always visible
    const minR = 4 / state.zoom;
    for (const b of bubbles) {
        const isHovered = hovBubble && b === hovBubble;
        const color = subtypeColor(b.subtype);

        if (hovBubble && !isHovered) {
            ctx.globalAlpha = 0.2 * state.detailOpacity;
        } else if (isHovered) {
            ctx.globalAlpha = 0.9 * state.detailOpacity;
        } else {
            ctx.globalAlpha = 0.6 * state.detailOpacity;
        }

        const rx = Math.max(b.rx, minR);
        const ry = Math.max(b.ry, minR);

        ctx.fillStyle = color;
        ctx.strokeStyle = isHovered ? '#fff' : color;
        ctx.lineWidth = isHovered ? 2 / state.zoom : 1 / state.zoom;

        ctx.beginPath();
        ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

function drawDetail() {
    const ctx = state.ctx;
    ctx.globalAlpha = state.detailOpacity;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const hovChain = state.hoveredChain;
    const hovBubble = state.hoveredBubble;

    // --- Chain polylines ---
    drawChainPolylines(state.detailData.chains, Math.max(1.5, 3 / state.zoom), hovChain);

    // --- Exposed bubbles ---
    if (state.detailData.bubbles && state.detailData.bubbles.length > 0) {
        drawBubbleEllipses(state.detailData.bubbles, hovBubble);
    }

    // --- Hover highlight ---
    if (state.hoveredChain) {
        const hc = state.hoveredChain;
        const pl = hc.polyline;

        // Highlight hovered chain with bright stroke
        if (pl.length >= 2) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = Math.max(2.5, 5 / state.zoom);
            ctx.globalAlpha = 0.3 * state.detailOpacity;
            ctx.beginPath();
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let i = 1; i < pl.length; i++) {
                ctx.lineTo(pl[i][0], pl[i][1]);
            }
            ctx.stroke();
            ctx.globalAlpha = state.detailOpacity;
        }
    }

    if (state.hoveredBubble) {
        const b = state.hoveredBubble;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(2, 3 / state.zoom);
        ctx.globalAlpha = 0.5 * state.detailOpacity;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = state.detailOpacity;
    }

    ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------
// Main draw
// ---------------------------------------------------------------
export function draw() {
    const ctx = state.ctx;
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    const li = selectLevel();
    const level = state.data.levels[li];
    if (!level) return;

    const levelChanged = li !== state.currentLevel;
    state.currentLevel = li;

    // Update detail bar readouts (steps change with pan/zoom)
    if (state.detailPhase !== 'none') updateDetailBar();

    const vp = getViewport();
    // Margin in data units so lines at the edge aren't clipped
    const margin = (level.cellSize || 50) * 2;
    const vpMinX = vp.minX - margin;
    const vpMinY = vp.minY - margin;
    const vpMaxX = vp.maxX + margin;
    const vpMaxY = vp.maxY + margin;

    // ===== SKELETON LAYER =====
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    // --- Polylines (culled) ---
    const lineWidth = Math.max(0.5, 1.2 / state.zoom);
    const skelAlpha = state.detailData ? state.skeletonOpacity : 1;
    const hovSkel = state.hoveredSkeletonPl;
    const hasSkeletonHover = hovSkel && hovSkel.levelIdx === li;
    const hovChainId = hasSkeletonHover ? hovSkel.chainId : null;
    const hovFamily = hovChainId !== null && state.data.chainFamily
        ? state.data.chainFamily[hovChainId] : null;
    ctx.strokeStyle = `rgba(255, 255, 255, ${(hasSkeletonHover ? 0.3 : 0.75) * skelAlpha})`;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const bboxes = state.levelBboxes[li];
    const chainIds = level.chainIds;
    let visiblePl = 0;

    ctx.beginPath();
    for (let i = 0; i < level.polylines.length; i++) {
        const o = i * 4;
        if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
            bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;

        visiblePl++;
        if (hovFamily && hovFamily.has(chainIds[i])) continue;
        const pl = level.polylines[i];
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let j = 1; j < pl.length; j++) {
            ctx.lineTo(pl[j][0], pl[j][1]);
        }
    }
    ctx.stroke();

    // --- Hovered chain + descendants highlight ---
    if (hovFamily) {
        ctx.strokeStyle = `rgba(91, 184, 240, ${skelAlpha})`;
        ctx.lineWidth = Math.max(2, 3 / state.zoom);
        ctx.beginPath();
        for (let i = 0; i < level.polylines.length; i++) {
            if (!hovFamily.has(chainIds[i])) continue;
            const o = i * 4;
            if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
                bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;
            const pl = level.polylines[i];
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let j = 1; j < pl.length; j++) {
                ctx.lineTo(pl[j][0], pl[j][1]);
            }
        }
        ctx.stroke();
        ctx.lineWidth = lineWidth;
    }

    // --- Gene-colored polylines (overdraw) ---
    const genePins = getGenePins();
    const geneYMargin = (level.cellSize || 50) * 3;
    if (genePins.length > 0) {
        ctx.strokeStyle = `rgba(232, 167, 53, ${skelAlpha})`;
        ctx.lineWidth = lineWidth * 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        for (let i = 0; i < level.polylines.length; i++) {
            const o = i * 4;
            if (bboxes[o+2] < vpMinX || bboxes[o] > vpMaxX ||
                bboxes[o+3] < vpMinY || bboxes[o+1] > vpMaxY) continue;

            let inGene = false;
            for (const gene of genePins) {
                if (bboxes[o+2] >= gene.startX && bboxes[o] <= gene.endX &&
                    bboxes[o+3] >= gene.minY - geneYMargin && bboxes[o+1] <= gene.maxY + geneYMargin) {
                    inGene = true;
                    break;
                }
            }
            if (!inGene) continue;

            const pl = level.polylines[i];
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let j = 1; j < pl.length; j++) {
                ctx.lineTo(pl[j][0], pl[j][1]);
            }
        }
        ctx.stroke();
    }

    // --- Junctions (culled) ---
    const r = Math.max(1.5, 3.0 / state.zoom);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * skelAlpha})`;
    let visibleJ = 0;

    ctx.beginPath();
    for (const [x, y] of level.junctions) {
        if (x < vpMinX || x > vpMaxX || y < vpMinY || y > vpMaxY) continue;
        visibleJ++;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    // --- Gene-colored junctions (overdraw) ---
    if (genePins.length > 0) {
        const gr = Math.max(2, 4.0 / state.zoom);
        ctx.fillStyle = `rgba(232, 167, 53, ${skelAlpha})`;
        ctx.beginPath();
        for (const [x, y] of level.junctions) {
            if (x < vpMinX || x > vpMaxX || y < vpMinY || y > vpMaxY) continue;
            let inGene = false;
            for (const gene of genePins) {
                if (x >= gene.startX && x <= gene.endX &&
                    y >= gene.minY - geneYMargin && y <= gene.maxY + geneYMargin) {
                    inGene = true;
                    break;
                }
            }
            if (!inGene) continue;
            ctx.moveTo(x + gr, y);
            ctx.arc(x, y, gr, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    // ===== DETAIL LAYER (drawn in same data-space transform) =====
    if (state.detailData && state.detailOpacity > 0) {
        drawDetail();
    }

    ctx.restore();

    // --- Gene labels (screen coords) ---
    if (genePins.length > 0) {
        const fontSize = 11;
        ctx.font = `600 ${fontSize}px 'SF Mono', Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        for (const gene of genePins) {
            const sxStart = gene.startX * state.zoom + state.panX;
            const sxEnd = gene.endX * state.zoom + state.panX;
            const sxMid = (sxStart + sxEnd) / 2;
            const syRef = gene.refY * state.zoom + state.panY;
            if (sxEnd < -60 || sxStart > cw + 60) continue;

            const geneW = sxEnd - sxStart;
            const bracketY = syRef - 16;

            ctx.strokeStyle = '#e8a735';
            ctx.lineWidth = 1.5;
            if (geneW > 6) {
                ctx.beginPath();
                ctx.moveTo(sxStart, syRef + 4);
                ctx.lineTo(sxStart, bracketY);
                ctx.lineTo(sxEnd, bracketY);
                ctx.lineTo(sxEnd, syRef + 4);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(sxMid, syRef + 4);
                ctx.lineTo(sxMid, bracketY);
                ctx.stroke();
            }

            const label = gene.name;
            const tw = ctx.measureText(label).width;
            const px = 5, py = 2;
            const ly = bracketY - 4;

            ctx.fillStyle = 'rgba(40, 32, 10, 0.85)';
            const rr = 3;
            const rx = sxMid - tw / 2 - px;
            const ry = ly - fontSize - py;
            const rw = tw + px * 2;
            const rh = fontSize + py * 2;
            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, rr);
            ctx.fill();

            ctx.fillStyle = '#e8a735';
            ctx.fillText(label, sxMid, ly);
        }
    }

    // --- Update info ---
    if (levelChanged) {
        state.dom.levelLabel.textContent = level.label;
        state.dom.nodeCount.textContent = level.nodeCount.toLocaleString();
        state.dom.polylineCount.textContent = level.polylineCount.toLocaleString();
        const pct = ((1 - level.nodeCount / state.data.stats.totalSegments) * 100).toFixed(1);
        state.dom.reduction.textContent = `${pct}%`;
    }
    state.dom.visibleCount.textContent = `${visiblePl.toLocaleString()} / ${visibleJ.toLocaleString()}`;

    // --- Viewport coordinate readout ---
    const chr = getChromosome();
    if (chr) {
        const bpLeft = xToBp(vp.minX);
        const bpRight = xToBp(vp.maxX);
        if (bpLeft !== null && bpRight !== null) {
            state.dom.viewportBp.textContent = `${chr}:${formatBp(bpLeft)}-${formatBp(bpRight)}`;
        }
    }
}

// ---------------------------------------------------------------
// RAF-throttled frame scheduling
// ---------------------------------------------------------------
export function scheduleFrame() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        draw();
    });
}
