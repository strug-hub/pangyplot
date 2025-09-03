import { updateDebugInformation } from '../../ui/tabs/information-panel.js';
import { getZoomFactor, getScaleFactor, getDampenedZoomFactor } from '../render/render-scaling.js';

var frameRate = 0;
var lastMousePosition = { x: 0, y: 0 };

//average across last frames
var frameTimes = [];

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

var isMouseListenerSetUp = false;
function setupMouseListener(canvasElement) {
    if (isMouseListenerSetUp) return;
    canvasElement.addEventListener('mousemove', (event) => {
        lastMousePosition.x = event.offsetX;
        lastMousePosition.y = event.offsetY;
    });
    isMouseListenerSetUp = true;
}

export function statusUpdate(forceGraph, canvasElement) {
    calculateFPS();
    updateDebugInformation(getStatus(forceGraph));
    setupMouseListener(canvasElement);
}

function getStatus(forceGraph) {
    const ndigits = 1;
    
    const canvasElement = document.querySelector('#graph-container canvas');
    const ctx = canvasElement.getContext('2d');


    const x = lastMousePosition.x;
    const y = lastMousePosition.y;
    const coordinates = forceGraph.screen2GraphCoords(x, y);

    return {
        fps: `${frameRate.toFixed(ndigits)}`,
        nodes: forceGraph ? forceGraph.graphData().nodes.length : 0,
        links: forceGraph ? forceGraph.graphData().links.length : 0,
        canvasX: x.toFixed(ndigits),
        canvasY: y.toFixed(ndigits),
        screenX: coordinates.x.toFixed(ndigits),
        screenY: coordinates.y.toFixed(ndigits),
        zoom: `${getZoomFactor(ctx).toFixed(3)}`,
        scale: `${getScaleFactor(ctx).toFixed(3)}`,
        dampzoom: `${getDampenedZoomFactor(ctx).toFixed(3)}`
    };
}