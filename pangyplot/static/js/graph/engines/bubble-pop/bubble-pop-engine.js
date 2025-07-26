import { fetchSubgraph } from './bubble-pop-fetch.js';

var bubblePopMode = false;
var wasBubbleModeOnDown = false;

export function attemptBubblePop(node, forceGraph) {
    if (bubblePopMode && node.type == "bubble") {
        fetchSubgraph(node, forceGraph);
    }
}

export function popNodeEnginePopAll(nodes, forceGraph) {
    nodes.forEach(node => {
        if (node.type == "bubble") {
            fetchSubgraph(node, forceGraph);
        }
    });
}

function popNodeEngineMouseClick(event, forceGraph, canvasElement, canvas, coordinates, inputState){
    if (inputState===NODE_POP_MODE){

        const nearestNode = findNearestNode(forceGraph.graphData().nodes, coordinates);
        if (nearestNode.type == "null" || nearestNode.type == "segment" || nearestNode.type == "collapse"){ 
            return;
        }
        const normDist = findNormalizedDistance(nearestNode, coordinates, canvas);
    
        if (normDist < CAN_CLICK_RANGE){
            fetchSubgraph(nearestNode, forceGraph);
        }
    }
}

export default function setUpBubblePopEngine(forceGraph, canvasElement) {

    forceGraph.onNodeClick(node => attemptBubblePop(node, forceGraph));

    const handleKeyChange = (event) => {

        bubblePopMode = false;
        canvasElement.style.cursor = "default";

        if (event.ctrlKey || event.metaKey) {

            bubblePopMode = true;
            canvasElement.style.cursor = "pointer";

            if (event.type === 'keydown') {
                wasBubbleModeOnDown = true;
            }
        }
    };

    canvasElement.addEventListener('keydown', handleKeyChange);
    canvasElement.addEventListener('keyup', handleKeyChange);
    canvasElement.addEventListener('mousemove', handleKeyChange);



}

