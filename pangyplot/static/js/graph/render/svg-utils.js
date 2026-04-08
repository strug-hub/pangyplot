// SVG batch painter primitives for the graph module.
// Each function mirrors a canvas painter in detail-painter.js or skeleton-painter.js,
// creating SVG DOM elements instead of canvas draw calls.
//
// Alpha strategy: canvas batches all subpaths into one beginPath()/stroke(), so
// overlapping strokes do NOT compound alpha. We replicate this with <g opacity="a">
// wrapping solid-color children. Group opacity composites children to an offscreen
// buffer first (at full opacity), then blends the buffer — matching canvas behavior.
// This also avoids stroke-opacity/fill-opacity which Firefox handles inconsistently.

const NS = 'http://www.w3.org/2000/svg';

// Data-to-screen transform. Set by export before rendering.
// Firefox has precision issues with genome-scale coordinates (millions) inside
// SVG <g transform>, so we pre-transform all data-space points to screen-space.
let tx = 0, ty = 0, sc = 1;

export function setSvgTransform(panX, panY, zoom) {
    tx = panX; ty = panY; sc = zoom;
}

export function clearSvgTransform() {
    tx = 0; ty = 0; sc = 1;
}

function sx(x) { return x * sc + tx; }
function sy(y) { return y * sc + ty; }

// Parse rgba()/rgb() into {color, alpha} for SVG-safe attributes.
const rgbaRe = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/;
function parseColor(color) {
    const m = rgbaRe.exec(color);
    if (m) {
        const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
        return { color: `rgb(${m[1]},${m[2]},${m[3]})`, alpha: a };
    }
    return { color, alpha: 1 };
}

// Wrap in <g opacity="..."> combining both the parsed color alpha and the
// explicit alpha parameter. Children use the solid color.
function wrapGroup(parent, colorAlpha, explicitAlpha) {
    const combined = (colorAlpha ?? 1) * (explicitAlpha ?? 1);
    if (combined < 1) {
        const group = document.createElementNS(NS, 'g');
        group.setAttribute('opacity', combined);
        parent.appendChild(group);
        return group;
    }
    return parent;
}

function polylinePoints(pl) {
    let s = '';
    for (let i = 0; i < pl.length; i++) {
        if (i) s += ' ';
        s += `${sx(pl[i][0])},${sy(pl[i][1])}`;
    }
    return s;
}

function addPolyline(parent, pl, color, lineWidth) {
    const el = document.createElementNS(NS, 'polyline');
    el.setAttribute('points', polylinePoints(pl));
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', lineWidth * sc);
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('fill', 'none');
    parent.appendChild(el);
}

// --- Skeleton painter SVG equivalents ---

export function strokePolylinesSvg(target, polylines, indices, color, lineWidth, alpha) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    for (const i of indices) {
        addPolyline(parent, polylines[i], c, lineWidth);
    }
}

/**
 * Stroke polylines clipped to data-space x range [xMin, xMax].
 * Segments crossing the boundary are interpolated.
 */
export function strokePolylinesSvgClipX(target, polylines, indices, color, lineWidth, xMin, xMax) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca);
    for (const i of indices) {
        const pl = polylines[i];
        const clipped = clipPolylineX(pl, xMin, xMax);
        for (const seg of clipped) {
            addPolyline(parent, seg, c, lineWidth);
        }
    }
}

/** Clip a polyline to [xMin, xMax], returning an array of sub-polylines. */
function clipPolylineX(pl, xMin, xMax) {
    const result = [];
    let current = null;
    for (let j = 0; j < pl.length; j++) {
        const x = pl[j][0], y = pl[j][1];
        const inside = x >= xMin && x <= xMax;
        if (j === 0) {
            if (inside) current = [[x, y]];
            continue;
        }
        const px = pl[j-1][0], py = pl[j-1][1];
        const prevIn = px >= xMin && px <= xMax;

        if (prevIn && inside) {
            current.push([x, y]);
        } else if (prevIn && !inside) {
            const edge = x > xMax ? xMax : xMin;
            const t = (edge - px) / (x - px);
            current.push([edge, py + t * (y - py)]);
            result.push(current);
            current = null;
        } else if (!prevIn && inside) {
            const edge = px < xMin ? xMin : xMax;
            const t = (edge - px) / (x - px);
            current = [[edge, py + t * (y - py)], [x, y]];
        }
    }
    if (current && current.length >= 2) result.push(current);
    return result;
}

function fillDotPointsSvg(target, points, r, color, alpha) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    const sr = r * sc;
    let d = '';
    for (const [x, y] of points) {
        const cx = sx(x), cy = sy(y);
        d += `M${cx - sr},${cy}A${sr},${sr},0,1,0,${cx + sr},${cy}A${sr},${sr},0,1,0,${cx - sr},${cy}`;
    }
    if (!d) return;
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d);
    el.setAttribute('fill', c);
    parent.appendChild(el);
}

// --- Detail painter SVG equivalents ---

export function strokeLinesSvg(target, lines, color, lineWidth, alpha) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    let d = '';
    for (const line of lines) {
        d += `M${sx(line[0][0])},${sy(line[0][1])}L${sx(line[1][0])},${sy(line[1][1])}`;
    }
    if (!d) return;
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d);
    el.setAttribute('stroke', c);
    el.setAttribute('stroke-width', lineWidth * sc);
    el.setAttribute('fill', 'none');
    parent.appendChild(el);
}

export function fillDotsSvg(target, points, r, color, alpha) {
    fillDotPointsSvg(target, points, r, color, alpha);
}

export function strokePolylineSvg(target, pl, color, lineWidth, alpha) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    addPolyline(parent, pl, c, lineWidth);
}

export function strokeBatchPolylinesSvg(target, polylines, color, lineWidth, alpha) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    for (const pl of polylines) {
        if (pl.length < 2) continue;
        addPolyline(parent, pl, c, lineWidth);
    }
}

export function fillCirclesSvg(target, circles, color, alpha) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    let d = '';
    for (const { x, y, r } of circles) {
        const cx = sx(x), cy = sy(y), sr = r * sc;
        d += `M${cx - sr},${cy}A${sr},${sr},0,1,0,${cx + sr},${cy}A${sr},${sr},0,1,0,${cx - sr},${cy}`;
    }
    if (!d) return;
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d);
    el.setAttribute('fill', c);
    parent.appendChild(el);
}

export function strokeRingSvg(target, x, y, r, color, lineWidth, alpha) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('cx', sx(x));
    el.setAttribute('cy', sy(y));
    el.setAttribute('r', r * sc);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', c);
    el.setAttribute('stroke-width', lineWidth * sc);
    parent.appendChild(el);
}

export function strokeSegmentsSvg(target, segments, color, lineWidth, alpha) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    let d = '';
    for (const { x1, y1, x2, y2 } of segments) {
        d += `M${sx(x1)},${sy(y1)}L${sx(x2)},${sy(y2)}`;
    }
    if (!d) return;
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d);
    el.setAttribute('stroke', c);
    el.setAttribute('stroke-width', lineWidth * sc);
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('fill', 'none');
    parent.appendChild(el);
}

export function strokeDashedPolylinesSvg(target, polylines, color, lineWidth, alpha, dash) {
    const { color: c, alpha: ca } = parseColor(color);
    const parent = wrapGroup(target, ca, alpha);
    const slw = lineWidth * sc, sd = dash * sc;
    for (const pl of polylines) {
        if (pl.length < 2) continue;
        const el = document.createElementNS(NS, 'polyline');
        el.setAttribute('points', polylinePoints(pl));
        el.setAttribute('stroke', c);
        el.setAttribute('stroke-width', slw);
        el.setAttribute('stroke-dasharray', `${sd} ${sd}`);
        el.setAttribute('fill', 'none');
        parent.appendChild(el);
    }
}

/**
 * Draw a gene label: vertical stem line + badge rect + text.
 * @param {number} badgeW — actual measured text width + padding (from ctx.measureText)
 */
export function drawGeneLabelSvg(target, name, sxMid, badgeTop, badgeH, badgeW, stemY, color, showStem) {
    const group = document.createElementNS(NS, 'g');
    const gap = 4;

    // Simple vertical stem (matches canvas: moveTo(sxMid, syRef+4) → lineTo(sxMid, bracketY))
    if (showStem) {
        const bracketY = badgeTop + badgeH + gap;
        const stem = document.createElementNS(NS, 'line');
        stem.setAttribute('x1', sxMid);
        stem.setAttribute('y1', stemY + 4);
        stem.setAttribute('x2', sxMid);
        stem.setAttribute('y2', bracketY);
        stem.setAttribute('stroke', color);
        stem.setAttribute('stroke-width', 1.5);
        group.appendChild(stem);
    }

    // Badge background — uses real measured width
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', sxMid - badgeW / 2);
    rect.setAttribute('y', badgeTop);
    rect.setAttribute('width', badgeW);
    rect.setAttribute('height', badgeH);
    rect.setAttribute('rx', 3);
    rect.setAttribute('fill', 'rgb(40,32,10)');
    rect.setAttribute('opacity', 0.85);
    group.appendChild(rect);

    // Label text — positioned to match canvas textBaseline='bottom' at badge bottom
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', sxMid);
    text.setAttribute('y', badgeTop + badgeH - 3);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', "'SF Mono', Consolas, monospace");
    text.setAttribute('font-size', 11);
    text.setAttribute('font-weight', 600);
    text.setAttribute('fill', color);
    text.textContent = name;
    group.appendChild(text);

    target.appendChild(group);
}

// Helper: create a <g> with mix-blend-mode for gene overlay compositing
export function createBlendGroup(target, mode) {
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('style', `mix-blend-mode: ${mode}`);
    target.appendChild(group);
    return group;
}
