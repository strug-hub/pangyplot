import DEBUG_MODE from '../../../../debug-mode.js';

import { updateDebugInformation } from '../../../../ui/tabs/information-panel.js';
import { getZoomFactor,getZoomLevel, getScaleFactor } from '../../../render/render-scaling.js';

//average across last frames
var frameTimes = [];
var frameRate = 0;

var lastMousePosition = { x: 0, y: 0 };
var lastAlpha = 0;

function calculateFPS() {
    const now = Date.now();
    frameTimes.push(now);

    const maxFrames = 20;
    if (frameTimes.length > maxFrames) {
        frameTimes.shift();
    }

    if (frameTimes.length > 1) {
        const timeDiff = frameTimes[frameTimes.length - 1] - frameTimes[0];
        frameRate = 1000 * frameTimes.length / timeDiff;
    }
}

function getDebugStatus(forceGraph) {
    const ndigits = 1;

    const ctx = forceGraph.canvas.ctx;

    const x = lastMousePosition.x;
    const y = lastMousePosition.y;
    const coordinates = forceGraph.screen2GraphCoords(x, y);

    return {
        fps: `${frameRate.toFixed(ndigits)}`,
        nodes: forceGraph ? forceGraph.graphData().nodes.length : 0,
        links: forceGraph ? forceGraph.graphData().links.length : 0,
        screenX: x.toFixed(ndigits),
        screenY: y.toFixed(ndigits),
        graphX: coordinates.x.toFixed(ndigits),
        graphY: coordinates.y.toFixed(ndigits),
        alpha: lastAlpha.toFixed(3),
        zoom: `${getZoomFactor(ctx).toFixed(3)}`,
        zoomLevel: `${getZoomLevel(ctx)}:${getZoomLevel(ctx,true).toFixed(3)}`,
        scale: `${getScaleFactor(ctx).toFixed(3)}`
    };
}

export function debugStatusUpdate(forceGraph) {
    if (!DEBUG_MODE) return;

    calculateFPS();
    const status = getDebugStatus(forceGraph);
    updateDebugInformation(status);
}

export function setUpDebugInformationEngine(forceGraph) {
    if (!DEBUG_MODE) return;

    forceGraph.d3Force('getAlpha', alpha => lastAlpha = alpha);

    forceGraph.element.addEventListener('mousemove', (event) => {
        lastMousePosition.x = event.offsetX;
        lastMousePosition.y = event.offsetY;
    });
}