import { fetchSubgraph } from './bubble-pop-fetch.js';

var bubblePopMode = false;

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

export default function setUpBubblePopEngine(forceGraph, canvasElement) {

    forceGraph.onNodeClick(node => attemptBubblePop(node, forceGraph));

    canvasElement.addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.metaKey) {
            bubblePopMode = true
            canvasElement.style.cursor = "pointer";
        }
    });
}

