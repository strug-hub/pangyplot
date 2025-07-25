import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import { updateSelectionState } from './selection-state.js';
import { findNearestNode, euclideanDist } from '../../utils/node-utils.js';
import { isDebugMode } from '../../graph-state.js';
import { multiSelectInProgress } from './multi-selection/multi-selection-engine.js';

let hoverNode = null;
const MAX_HOVER_DISTANCE = 40;
const MAX_SELECT_DISTANCE = 25;

function hoverPreview(event, forceGraph) {
    hoverNode = null;
    if (multiSelectInProgress) return;

    const coords = { x: event.offsetX, y: event.offsetY };
    const graphCoords = forceGraph.screen2GraphCoords(coords.x, coords.y);
    const nodes = forceGraph.graphData().nodes;
    nodes.forEach(node => node.isHighlighted = false);

    const nearestNode = findNearestNode(nodes, graphCoords);
    if (!nearestNode) return;

    const screenPos = forceGraph.graph2ScreenCoords(nearestNode.x, nearestNode.y);
    const distPx = euclideanDist(coords, screenPos);

    if (distPx > MAX_HOVER_DISTANCE) return;
    console.log("Pixel distance:", distPx);

    hoverNode = nearestNode;
    nearestNode.isHighlighted = true;
}

export function attemptSelection(event, forceGraph) {
    if (event.button !== 0 || multiSelectInProgress) return; // Only left click

    forceGraph.graphData().nodes.forEach(node => node.isSelected = false);
    if (hoverNode == null) return;

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

    hoverNode.isHighlighted = false;
    hoverNode.isSelected = true;
    hoverNode = null
}

export default function setUpSelectionEngine(forceGraph, canvasElement) {

    canvasElement.addEventListener('pointermove', (event) => {
        hoverPreview(event, forceGraph);
    });
    canvasElement.addEventListener('click', (event) => {
        attemptSelection(event, forceGraph);
    });

    setUpMultiSelectionEngine(forceGraph, canvasElement);
        forceGraph.onEngineTick(() => {
            updateSelectionState(forceGraph.graphData().nodes);
        })
}