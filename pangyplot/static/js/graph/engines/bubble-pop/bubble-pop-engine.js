import { fetchSubgraph } from './bubble-pop-fetch.js';
import { findNearestNode, euclideanDist } from '../../utils/node-utils.js';
import { undoBubblePop } from './bubble-pop-undo.js';

var bubblePopMode = false;

const BUBBLE_POP_RANGE = 25;

export function deleteNode(graphData, id) {
    graphData.nodes = graphData.nodes.filter(node => node.id !== id);
    graphData.links = graphData.links.filter(link =>
        (link.class === "node" && link.id !== id) ||
        (link.class === "link" && link.source.id !== id && link.target.id !== id)
    );
}
export function popGroupOfBubbles(nodes, forceGraph) {
    nodes.forEach(node => {
        if (node.type == "bubble") {
            fetchSubgraph(node, forceGraph);
        }
    });
}

function updateKeyChange(event, canvasElement){
    bubblePopMode = false;
    canvasElement.style.cursor = "default";

    if (event.ctrlKey || event.metaKey) {
        bubblePopMode = true;
        canvasElement.style.cursor = "pointer";
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
        fetchSubgraph(nearestNode, forceGraph);
    }
}

function keyDown(event, forceGraph, canvasElement) {
    updateKeyChange(event, canvasElement);
    checkUndo(event, forceGraph);
}

function keyUp(event, forceGraph, canvasElement) {
    if (bubblePopMode) {
        bubblePopMode = false;
        canvasElement.style.cursor = "pointer";
    }
}

function pointerMove(event, forceGraph, canvasElement) {
    updateKeyChange(event, canvasElement);
}

function pointerUp(event, forceGraph, canvasElement) {
    attemptBubblePop(event, forceGraph);
}

export default function setUpBubblePopEngine(forceGraph, canvasElement) {

    canvasElement.addEventListener('keydown', event => keyDown(event, forceGraph, canvasElement));
    canvasElement.addEventListener('keyup', event => keyUp(event, forceGraph, canvasElement));
    canvasElement.addEventListener('pointermove', event => pointerMove(event, forceGraph, canvasElement));
    canvasElement.addEventListener('pointerup', event => pointerUp(event, forceGraph, canvasElement));

}

