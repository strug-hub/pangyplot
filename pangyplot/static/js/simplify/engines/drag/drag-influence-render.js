// Visual feedback during drag: blue dashed circle showing influence radius.
// Drawn in data-space (within the canvas transform).

import { state } from '../../simplify-state.js';
import { getInfluence } from './drag-influence-force.js';

export function renderDragInfluenceCircle(ctx) {
    if (!state.dragMode) return;

    // Determine circle center
    let cx, cy;
    if (state.dragMode === 'node') {
        cx = state.dragTarget.x;
        cy = state.dragTarget.y;
    } else if (state.dragChainNodes && state.dragChainNodes.length > 0) {
        // Chain centroid
        let sx = 0, sy = 0;
        for (const n of state.dragChainNodes) {
            sx += n.x;
            sy += n.y;
        }
        cx = sx / state.dragChainNodes.length;
        cy = sy / state.dragChainNodes.length;
    } else {
        return;
    }

    const influence = getInfluence();
    const graphRadius = influence * 200 / state.zoom;
    const lineWidth = Math.max(1, 2 / state.zoom);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, graphRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([10 / state.zoom, 4 / state.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}
