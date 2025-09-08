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

function updateKeyChange(event, forceGraph){
    bubblePopMode = false;
    if (forceGraph.element.style.cursor === "pointer") {
        forceGraph.element.style.cursor = "default";
    }

    if (event.ctrlKey || event.metaKey) {
        bubblePopMode = true;
        forceGraph.element.style.cursor = "pointer";
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

export default function setUpBubblePopEngine(forceGraph) {

    forceGraph.element.addEventListener('keydown', (event) => {
        updateKeyChange(event, forceGraph);
        checkUndo(event, forceGraph);
    });

    forceGraph.element.addEventListener('keyup', event => {
        if (bubblePopMode) {
            bubblePopMode = false;
            forceGraph.element.style.cursor = "default";
        }
    });
    
    forceGraph.element.addEventListener('pointermove', event => {
        updateKeyChange(event, forceGraph);
    });

    forceGraph.element.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        attemptBubblePop(event, forceGraph);
    });
}

