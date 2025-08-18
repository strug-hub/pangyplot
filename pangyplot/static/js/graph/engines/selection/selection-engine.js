import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import { updateSelectionState, flipBubbleMode, isInBubbleMode } from './selection-state.js';
import { findNearestNode, euclideanDist } from '../../utils/node-utils.js';
import { isDebugMode } from '../../graph-state.js';
import { multiSelectInProgress } from './multi-selection/multi-selection-engine.js';
import { isPanZoomMode } from '../navigate/pan-zoom-engine.js';

const hoverNodes = [];
const MAX_HOVER_DISTANCE = 40;
const MAX_SELECT_DISTANCE = 25;

function hoverPreview(event, forceGraph) {
    hoverNodes.length = 0;
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

    hoverNodes.push(nearestNode);
    nearestNode.isHighlighted = true;
}

function cleanSelection(event, forceGraph) {
    if (event.button !== 0 || multiSelectInProgress || isPanZoomMode()) return; // Only left click

    if (hoverNodes.length === 0 || !hoverNodes[0].isSelected) {
        forceGraph.graphData().nodes.forEach(node => node.isSelected = false);
        return;
    }
}

function attemptSelection(event, forceGraph) {
    if (event.button !== 0 || multiSelectInProgress || isPanZoomMode()) return; // Only left click

    if (hoverNode == null) return;
    const coords = { x: event.offsetX, y: event.offsetY };
    const screenPos = forceGraph.graph2ScreenCoords(hoverNode.x, hoverNode.y);
    const distPx = euclideanDist(coords, screenPos);

    if (distPx > MAX_SELECT_DISTANCE) return;

    if (isDebugMode()) {
        console.log("clicked:", hoverNodes[0]);
        const connectedEdges = forceGraph.graphData().links.filter(link =>
            link.source === hoverNodes[0] || link.target === hoverNodes[0]
        );
        console.log("connected edges:", connectedEdges);
    }

    hoverNodes[0].isHighlighted = false;
    hoverNodes[0].isSelected = true;
    hoverNodes.length = 0;
}

function switchBubbleMode(event) {
    if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        flipBubbleMode();
    }
}



export default function setUpSelectionEngine(forceGraph, canvasElement) {

    canvasElement.addEventListener('pointermove', (event) => {
        hoverPreview(event, forceGraph);
    });
    canvasElement.addEventListener('pointerdown', (event) => {
        cleanSelection(event, forceGraph);
    });
    canvasElement.addEventListener('pointerup', (event) => {
        attemptSelection(event, forceGraph);
    });
    canvasElement.addEventListener('keydown', (event) => {
        switchBubbleMode(event);
    });



    setUpMultiSelectionEngine(forceGraph, canvasElement);
    forceGraph.onEngineTick(() => {
        updateSelectionState(forceGraph.graphData().nodes);
    })
}