
import { clearHighlighted, canHighlight, updateHighlighted, updateHoverNode} from './selection-state.js';
import { findNearestNode, euclideanDist } from '../../utils/node-utils.js';

const MAX_HOVER_DISTANCE = 40;

function hoverPreview(event, forceGraph) {
    if (!canHighlight()) {
        return;
    }

    const coords = { x: event.offsetX, y: event.offsetY };
    const graphCoords = forceGraph.screen2GraphCoords(coords.x, coords.y);
    const nodes = forceGraph.graphData().nodes;

    const nearestNode = findNearestNode(nodes, graphCoords);
    if (!nearestNode) {
        clearHighlighted();
        return;
    } 

    const screenPos = forceGraph.graph2ScreenCoords(nearestNode.x, nearestNode.y);
    const distPx = euclideanDist(coords, screenPos);

    if (distPx > MAX_HOVER_DISTANCE) {
        clearHighlighted();
        return;
    }

    updateHighlighted([nearestNode]);
    updateHoverNode(nearestNode);
}

export default function setUpHoverEngine(forceGraph, canvasElement) {

    canvasElement.addEventListener('pointermove', (event) => {
        hoverPreview(event, forceGraph);
    });

}