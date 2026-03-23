import { getCanvasWidth, getCanvasHeight } from '../ui/ui-canvas-size.js';
import eventBus from '@event-bus';

const scaleSettings = {
    constantScale: 2,
    widthMultiplier: 2,
    textMultiplier: 1
};

export function updateWidthMultiplier(value) {
    scaleSettings.widthMultiplier = value;
}
export function updateTextMultiplier(value) {
    scaleSettings.textMultiplier = value;
}

function dampenedZoom(z, strength = 0.1) {
  // strength between 0 and 1, closer to 0 = heavier dampening
  return 1 + (z - 1) * strength;
}

const Z0=1;
const Z1=0.1;
const Z2=0.01;
const Z3=0.001;

export function getZoomLevel(ctx, continuous=false) {

    const zoomFactor = ctx.canvas.__zoom["k"];
    if (zoomFactor >= Z0) {
        return 0;
    } if (zoomFactor > Z1) {
        return continuous ?  1+(Z0 - zoomFactor) / (Z0 - Z1) : 1;
    } else if (zoomFactor > Z2) {
        return continuous ? 2+(Z1 - zoomFactor) / (Z1 - Z2) : 2;
    } else {
        return 3;
    }
}

export function getZoomFactor(ctx) {
    return ctx.canvas.__zoom["k"];
}
export function getDampenedZoomFactor(ctx) {
    return dampenedZoom(ctx.canvas.__zoom["k"]);
}



export function getScaleFactor(ctx) {
    const zoomFactor = ctx.canvas.__zoom["k"];
    const zoomLevel = getZoomLevel(ctx);
    
    let zoomLevelMultiplier;

    if (zoomLevel === 0) {
        zoomLevelMultiplier = 1;
    } else if (zoomLevel === 1) {
        zoomLevelMultiplier = 1/(2*zoomFactor);
    } else if (zoomLevel === 2) {
        zoomLevelMultiplier = 1/(2*zoomFactor);
    } else {
        zoomLevelMultiplier = 1/(2*zoomFactor);
    }

    return zoomLevelMultiplier * scaleSettings.constantScale * scaleSettings.widthMultiplier;
}

export function getTextScaleFactor(ctx) {
    const zoomFactor = ctx.canvas.__zoom["k"];
    const adjustedFactor = scaleSettings.textMultiplier;
    return 1/zoomFactor * adjustedFactor;
}


function updateMinZoomFromGraph(forceGraph) {
    const nodes = forceGraph.graphData().nodes;
    if (nodes.length === 0) return;

    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const graphWidth = Math.max(...xs) - Math.min(...xs);
    const graphHeight = Math.max(...ys) - Math.min(...ys);

    if (graphWidth === 0 && graphHeight === 0) return;

    const canvasWidth = getCanvasWidth();
    const canvasHeight = getCanvasHeight();

    // At zoom k, visible extent = canvasDim / k.
    // Limit to 2x graph extent: canvasDim / k <= 2 * graphDim => k >= canvasDim / (2 * graphDim)
    const minZoomX = graphWidth > 0 ? canvasWidth / (2 * graphWidth) : 0;
    const minZoomY = graphHeight > 0 ? canvasHeight / (2 * graphHeight) : 0;
    const minZoom = Math.max(minZoomX, minZoomY, 1e-6);

    forceGraph.minZoom(minZoom);
}

export function setUpRenderScaling(forceGraph) {
        forceGraph.minZoom(1e-6) //default = 0.01
        forceGraph.maxZoom(1) //default = 1000

        eventBus.subscribe("graph:data-replaced", () => {
            setTimeout(() => updateMinZoomFromGraph(forceGraph), 600);
        });
}