// SVG and PNG export for the simplify viewer.
// Replicates the core viewer pattern: runs the same rendering pipeline
// with an SVG target instead of canvas.

import { state } from '../simplify-state.js';
import { getViewport } from './viewport.js';
import { getLevelMeta } from '@simplify-data/chromosome-data.js';
import { drawSkeleton } from '../skeleton/render/skeleton-render-manager.js';
import { drawDetail } from '../detail/render/polychain/polychain-render-manager.js';
import { drawForceGraph } from '../detail/render/force-render-manager.js';
import { drawGeneLabelOverlay } from '../skeleton/render/gene-label-overlay.js';
import { getImageName } from '../../graph/render/download/download-utils.js';
import { setSvgTransform, clearSvgTransform } from './simplify-svg-utils.js';

const NS = 'http://www.w3.org/2000/svg';

export function exportSimplifyToSvg() {
    const ctx = state.ctx;
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;

    // Create SVG root
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('width', cw);
    svg.setAttribute('height', ch);
    svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);

    // Background
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', cw);
    bg.setAttribute('height', ch);
    bg.setAttribute('fill', '#373737');
    svg.appendChild(bg);

    // Viewport bounds — no margin for SVG
    const meta = getLevelMeta();
    if (!meta) { saveSvg(svg); return; }

    const vp = getViewport();

    // Pre-transform data-space coordinates to screen-space.
    // Firefox has precision issues with genome-scale coordinates (millions)
    // inside SVG <g transform>, so we bake the transform into each point.
    setSvgTransform(state.panX, state.panY, state.zoom);

    try {
        // Skeleton layer (coordinates transformed to screen-space by SVG utils)
        const skipSkeleton = state.detailData && state.detailPhase === 'static';
        if (!skipSkeleton) {
            drawSkeleton(ctx, vp.minX, vp.minY, vp.maxX, vp.maxY, svg);
        }

        // Detail layer
        if (state.detailData && state.detailOpacity > 0) {
            drawDetail(svg);
            drawForceGraph(ctx, Math.max(1.5, 3 / state.zoom), svg);
        }

        // Gene labels (already screen-space, transform not applied to labels)
        drawGeneLabelOverlay(ctx, cw, svg);
    } finally {
        clearSvgTransform();
    }

    saveSvg(svg);
}

export function exportSimplifyToPng() {
    const canvas = state.canvas;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = getImageName('png');
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function saveSvg(svg) {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = getImageName('svg');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
