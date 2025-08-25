import { getHoverNode, canSingleSelect, updateSelected } from './selection-state.js';
import { euclideanDist } from '../../utils/node-utils.js';
import { isDebugMode } from '../../graph-state.js';

const MAX_SELECT_DISTANCE = 25;

function attemptSelection(event, forceGraph) {
    if (!canSingleSelect()) return;

    const hoverNode = getHoverNode();
    if (!hoverNode) return;

    const coords = { x: event.offsetX, y: event.offsetY };
    const screenPos = forceGraph.graph2ScreenCoords(hoverNode.x, hoverNode.y);
    const distPx = euclideanDist(coords, screenPos);

    if (distPx > MAX_SELECT_DISTANCE) return;

    if (isDebugMode()) {
        console.log("clicked:", hoverNode);
        const connectedEdges = forceGraph.graphData().links.filter(link =>
            link.source === hoverNode || link.target === hoverNode
        );
        console.log("connected edges:", connectedEdges);
    }

    updateSelected([hoverNode]);
}


export default function setUpSingleSelectEngine(forceGraph, canvasElement) {

    canvasElement.addEventListener('pointerup', (event) => {
        if (event.button !== 0) return; // Only left click 
        attemptSelection(event, forceGraph);
    });
}