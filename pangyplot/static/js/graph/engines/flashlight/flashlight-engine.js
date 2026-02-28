import appState from '../../app-state.js';
import eventBus from '../../../utils/event-bus.js';
import { computeFlashlightAlphas, DIM_ALPHA } from './flashlight-bfs.js';

function applyFlashlight(forceGraph, hoveredNode) {
    if (!appState.flashlightMode || !hoveredNode) {
        clearFlashlight(forceGraph);
        return;
    }

    const recordId = hoveredNode.record?.id ?? hoveredNode.id;
    const alphas = computeFlashlightAlphas(recordId);

    for (const node of forceGraph.graphData().nodes) {
        const nodeRecordId = node.record?.id ?? node.id;
        node.flashlightAlpha = alphas.get(nodeRecordId) ?? DIM_ALPHA;
    }
}

function clearFlashlight(forceGraph) {
    for (const node of forceGraph.graphData().nodes) {
        delete node.flashlightAlpha;
    }
}

export default function setUpFlashlightEngine(forceGraph) {
    appState.flashlightMode = false;

    const checkbox = document.getElementById('flashlightToggle');
    checkbox.checked = false;

    checkbox.addEventListener('change', (event) => {
        appState.flashlightMode = event.target.checked;
        if (!appState.flashlightMode) {
            clearFlashlight(forceGraph);
        } else {
            applyFlashlight(forceGraph, appState.hoveredNode);
        }
    });

    forceGraph.element.addEventListener('keydown', (event) => {
        if (event.key === 'l') {
            checkbox.checked = !checkbox.checked;
            appState.flashlightMode = checkbox.checked;
            if (!appState.flashlightMode) {
                clearFlashlight(forceGraph);
            } else {
                applyFlashlight(forceGraph, appState.hoveredNode);
            }
        }
    });

    eventBus.subscribe('graph:hovered-changed', (node) => {
        applyFlashlight(forceGraph, node);
    });
}
