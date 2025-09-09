import { findNearestNode, euclideanDist } from "../../../utils/node-utils.js";
import { popBubble } from '../bubble-pop.js';

const BUBBLE_POP_RANGE_PX = 25;

function attemptBubblePop(event, forceGraph){
    if (!forceGraph.isBubblePopMode()) return;

    const coords = { x: event.offsetX, y: event.offsetY };
    const graphCoords = forceGraph.screen2GraphCoords(coords.x, coords.y);
    const nodes = forceGraph.graphData().nodes;
    
    const nearestNode = findNearestNode(nodes, graphCoords);
    if (!nearestNode || nearestNode.type != "bubble"){ 
        return;
    }
    const screenPos = forceGraph.graph2ScreenCoords(nearestNode.x, nearestNode.y);
    const distPx = euclideanDist(coords, screenPos);

    if (distPx > BUBBLE_POP_RANGE_PX) return;
    popBubble(nearestNode);

}

export default function setUpSinglePopEngine(forceGraph) {

    forceGraph.element.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;       
        attemptBubblePop(event, forceGraph);
    });
}