import { getSelectedNodeSet } from '../selection/selection-state.js';

export default function setUpRecenterEngine(forceGraph, graphElement) {
    graphElement.addEventListener('keydown', (event) => {

        if (event.code === 'Space' || event.key === ' ') {
            forceGraph.zoomToFit(200, 10, node => true); 
        }

        if (event.code === 'ArrowUp') {
            event.preventDefault();
            const selectedNodeSet = new getSelectedNodeSet();
            forceGraph.zoomToFit(200, 10, node => selectedNodeSet.has(node));
        }
    });
}
