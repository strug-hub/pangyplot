// Debug view: LOD grid overlay.
// L to toggle. Draws the simplification grid cells in data-space
// and shows LOD stats in screen-space.

import { state } from '../../state.js';
import { registerView } from '../debug-orchestrator.js';
import { getLevel } from '../../skeleton/data/skeleton-data.js';
import { getLevelMeta, getAllLevelMeta } from '@graph-data/chromosome-data.js';
import { lastCullStats } from '../../skeleton/render/skeleton-render-manager.js';

registerView({
    key: 'KeyL',
    keyLabel: 'L',
    label: 'LOD Grid',

    draw(ctx) {
        const level = getLevel();
        if (!level || !level.gridSize) return;

        const gs = level.gridSize;
        const dpr = window.devicePixelRatio || 1;
        const cw = state.canvas.width / dpr;
        const ch = state.canvas.height / dpr;

        const vpMinX = -state.panX / state.zoom;
        const vpMinY = -state.panY / state.zoom;
        const vpMaxX = (cw - state.panX) / state.zoom;
        const vpMaxY = (ch - state.panY) / state.zoom;

        // --- Stats panel (screen-space) ---
        const viewW = vpMaxX - vpMinX;
        const viewH = vpMaxY - vpMinY;
        const cellsX = Math.ceil(viewW / gs);
        const cellsY = Math.ceil(viewH / gs);

        const meta = getLevelMeta();
        const allMeta = getAllLevelMeta();
        const reduction = ((1 - meta.nodeCount / state.stats.totalSegments) * 100).toFixed(1);

        const { visible, drawn } = lastCullStats;

        const lines = [
            `Grid ${gs.toLocaleString()}  [level ${state.currentLOD}/${allMeta.length - 1}]  target: ${state.targetGridSize.toFixed(0)}`,
            `${meta.polylineCount.toLocaleString()} polylines  |  ${meta.nodeCount.toLocaleString()} nodes  |  -${reduction}% reduction`,
            `Cells in view:  ${cellsX} \u00D7 ${cellsY}  =  ${(cellsX * cellsY).toLocaleString()}`,
            `Drawing: ${drawn.toLocaleString()} / ${meta.polylineCount.toLocaleString()} in viewport`,
        ];

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const fontSize = 13;
        const lineHeight = 18;
        const padX = 12, padY = 8;
        const boxW = 440;
        const boxH = padY * 2 + lines.length * lineHeight;
        const bx = cw - boxW - 12;
        const by = 44;

        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#111';
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.globalAlpha = 1;

        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#5bb8f0';

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], bx + padX, by + padY + fontSize + i * lineHeight);
        }

        ctx.restore();
    },

    statusText() {
        const level = getLevel();
        return level ? `grid: ${level.gridSize}` : null;
    },
});
