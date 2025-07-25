import { getZoomFactor } from '../../graph-state.js';

export var relSize = 10;

export function zoomScaleUpdate(forceGraph) {
    const zoomFactor = getZoomFactor();

    relSize = Math.max(10, (2/zoomFactor));
    forceGraph.nodeRelSize(relSize);
}