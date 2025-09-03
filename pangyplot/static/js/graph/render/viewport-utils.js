
import { getCanvasWidth, getCanvasHeight } from './canvas-utils.js';

export function getViewport(forceGraph, buffer=1){
    const canvasWidth = getCanvasWidth();
    const canvasHeight = getCanvasHeight();

    const topLeftGraph = forceGraph.screen2GraphCoords(0, 0);
    const bottomRightGraph = forceGraph.screen2GraphCoords(canvasWidth, canvasHeight);

    const viewportWidth = (bottomRightGraph.x - topLeftGraph.x) * buffer;
    const viewportHeight = (bottomRightGraph.y - topLeftGraph.y) * buffer;

    const viewport = {
        x1: topLeftGraph.x - (viewportWidth - (bottomRightGraph.x - topLeftGraph.x)) / 2,
        x2: bottomRightGraph.x + (viewportWidth - (bottomRightGraph.x - topLeftGraph.x)) / 2,
        y1: topLeftGraph.y - (viewportHeight - (bottomRightGraph.y - topLeftGraph.y)) / 2,
        y2: bottomRightGraph.y + (viewportHeight - (bottomRightGraph.y - topLeftGraph.y)) / 2,
    };

    return viewport;
}

export function updateVisibility(forceGraph) {
    const VIEWPORT_BUFFER = 1.05;
    const viewport = getViewport(forceGraph, VIEWPORT_BUFFER);

    function insideViewportNode(node){
        return node.x > viewport.x1 &&
               node.x < viewport.x2 &&
               node.y > viewport.y1 &&
               node.y < viewport.y2 ;
    }

    forceGraph.graphData().nodes.forEach(node => {
        node.isVisible = insideViewportNode(node);
    });

    function insideViewportLink(link){
        const c1 = (link.source.x < viewport.x1 && link.target.x < viewport.x1)
        const c2 = (link.source.x > viewport.x2 && link.target.x > viewport.x2)
        const c3 = (link.source.y < viewport.y1 && link.target.y < viewport.y1)
        const c4 = (link.source.y > viewport.y2 && link.target.y > viewport.y2)
        return !c1 && !c2 && !c3 && !c4
    }

    forceGraph.graphData().links.forEach(link => {
        link.isVisible = insideViewportLink(link);
    });
}