import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import { updateSelectionState } from './selection-state.js';
import { findNearestNode, findNormalizedDistance } from '../../utils/node-utils.js';
import { isDebugMode } from '../../graph-state.js';

function selectionEngineMouseClick(event, forceGraph, canvasElement, canvas, coordinates, inputState){
    if (!BOX_SELECT && inputState==SELECTION_MODE && ! BLOCK_SINGLE_SELECTION){
        const nearestNode = findNearestNode(forceGraph.graphData().nodes, coordinates);
        if (nearestNode == null || nearestNode["type"] == "null"){ return }
        const normDist = findNormalizedDistance(nearestNode, coordinates, canvas);
    
        forceGraph.graphData().nodes.forEach(node => node.isSelected = false);
        if (normDist < CAN_CLICK_RANGE){
            destroySelectionBox();
            nearestNode.isSelected = true;
            console.log("clicked:", nearestNode);

            const connectedEdges = forceGraph.graphData().links.filter(link => 
                link.source === nearestNode || link.target === nearestNode
            );
            console.log("connected edges:", connectedEdges);
        }
    }
}

function checkMouseClick(event, forceGraph) {
    if (event.button !== 0) return; // Only left click

    const coordinates = { x: event.offsetX, y: event.offsetY };
    const nodes = forceGraph.graphData().nodes;
    const nearestNode = findNearestNode(nodes, coordinates, forceGraph);
    if (!nearestNode || nearestNode.class !== "node") return;

    const screenPos = forceGraph.graph2ScreenCoords(node.x, node.y);
    const normDist = Math.sqrt((coords.x - screenPos.x) ** 2 + (coords.y - screenPos.y) ** 2);
    console.log("Normalized distance:", normDist);

    nodes.forEach(node => node.isSelected = false);
    
    nearestNode.isSelected = true;

    if (isDebugMode() && false) {
        console.log("clicked:", nearestNode);
        const connectedEdges = forceGraph.graphData().links.filter(link => 
            link.source === nearestNode || link.target === nearestNode
        );
        console.log("connected edges:", connectedEdges);
    }
}

export default function setUpSelectionEngine(forceGraph, canvasElement) {

    canvasElement.addEventListener('click', (event) => {
        checkMouseClick(event, forceGraph);
    });

    setUpMultiSelectionEngine(forceGraph, canvasElement);
        forceGraph.onEngineTick(() => {
            updateSelectionState(forceGraph.graphData().nodes);
        })
}