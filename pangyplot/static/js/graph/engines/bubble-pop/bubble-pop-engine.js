import { fetchSubgraph } from './bubble-pop-fetch.js';
import { findNearestNode, euclideanDist } from '../../utils/node-utils.js';
import { undoBubblePop } from './bubble-pop-undo.js';

var bubblePopMode = false;

const BUBBLE_POP_RANGE = 25;

export function popGroupOfBubbles(nodes) {
    nodes.forEach(node => {
        if (node.type == "bubble") {
            fetchSubgraph(node);
        }
    });
}

function updateKeyChange(event, graphElement){
    bubblePopMode = false;
    if (graphElement.style.cursor === "pointer") {
        graphElement.style.cursor = "default";
    }

    if (event.ctrlKey || event.metaKey) {
        bubblePopMode = true;
        graphElement.style.cursor = "pointer";
    }
}
function checkUndo(event, forceGraph) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoBubblePop(forceGraph);
        return;
    }
}

function attemptBubblePop(event, forceGraph){
    if (bubblePopMode){

        const coords = { x: event.offsetX, y: event.offsetY };
        const graphCoords = forceGraph.screen2GraphCoords(coords.x, coords.y);
        const nodes = forceGraph.graphData().nodes;
        
        const nearestNode = findNearestNode(nodes, graphCoords);
        if (!nearestNode || nearestNode.type != "bubble"){ 
            return;
        }
        const screenPos = forceGraph.graph2ScreenCoords(nearestNode.x, nearestNode.y);
        const distPx = euclideanDist(coords, screenPos);

        if (distPx > BUBBLE_POP_RANGE) return;
        fetchSubgraph(nearestNode);
    }
}

function keyDown(event, forceGraph, graphElement) {
    updateKeyChange(event, graphElement);
    checkUndo(event, forceGraph);
}

function keyUp(event, forceGraph, graphElement) {

    if (bubblePopMode) {
        bubblePopMode = false;
        graphElement.style.cursor = "default";
    }
}

function pointerMove(event, forceGraph, graphElement) {
    updateKeyChange(event, graphElement);
}

function pointerUp(event, forceGraph, graphElement) {
    attemptBubblePop(event, forceGraph);
}

export default function setUpBubblePopEngine(forceGraph, graphElement) {

    graphElement.addEventListener('keydown', event => keyDown(event, forceGraph, graphElement));
    graphElement.addEventListener('keyup', event => keyUp(event, forceGraph, graphElement));
    graphElement.addEventListener('pointermove', event => pointerMove(event, forceGraph, graphElement));
    graphElement.addEventListener('pointerup', event => pointerUp(event, forceGraph, graphElement));

}

