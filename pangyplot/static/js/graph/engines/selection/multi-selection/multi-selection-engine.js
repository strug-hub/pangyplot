import eventBus from '@event-bus';
import { nodesInBox } from '../../../utils/node-utils.js';
import { selectionState } from '../selection-state.js';
import { MultiSelectionBox, createOverlay, updateOverlay, removeOverlay } from './multi-selection-box.js';
import appState from '../../../app-state.js';

const selectionBox = new MultiSelectionBox();
var overlayElement = null;
var selectionAllowed = true;

const SELECT_CURSOR = 'crosshair';

function pointerDown(event) {
    if (!selectionAllowed) return;
    selectionBox.beginBox(event.offsetX, event.offsetY);
}

function destroySelectionBox(forceGraph) {

    if (forceGraph.element.style.getPropertyValue('--graph-cursor').trim() === SELECT_CURSOR) {
        forceGraph.element.style.setProperty('--graph-cursor', 'default');
    }

    if (overlayElement) {
        removeOverlay(overlayElement);
        overlayElement = null;
    }
    selectionBox.clearBox();
}

function pointerMove(event, forceGraph) {

    if (!appState.isSelectionMode() || appState.isDragging()) {
        destroySelectionBox(forceGraph);
    }

    if (!selectionAllowed) return;

    const bounds = selectionBox.updateBox(event.offsetX, event.offsetY);

    if (bounds) {
        forceGraph.element.style.setProperty('--graph-cursor', SELECT_CURSOR);
        selectionState.multiSelectMode = true;
        if (!overlayElement) overlayElement = createOverlay(forceGraph.element);
        updateOverlay(overlayElement, bounds);

        // Highlight nodes
        const hitNodes = nodesInBox(forceGraph, bounds);
        appState.setHighlighted(hitNodes);

    } else if (overlayElement) {
        forceGraph.element.style.setProperty('--graph-cursor', 'default');
        destroySelectionBox(forceGraph)
    }
}

function pointerUp(event, forceGraph) {
    if (overlayElement) {
        const bounds = selectionBox.getBoxBounds();

        if (bounds) {
            const hitNodes = nodesInBox(forceGraph, bounds);
            appState.setSelected(hitNodes);
            appState.setHighlighted(null);
            appState.setHoveredNode(null);
        }
    }
    destroySelectionBox(forceGraph);


    setTimeout(() => selectionState.multiSelectMode = false, 0);
}

export default function setUpMultiSelectionEngine(forceGraph) {

    eventBus.subscribe('graph:mode-changed', (mode) => {
        selectionAllowed = false;
        destroySelectionBox(forceGraph);
        if (mode === 'selection') { selectionAllowed = true; }
    });

    forceGraph.element.addEventListener('pointerdown', event => {
        if (event.button !== 0) return; // Only left click
        pointerDown(event);
    });

    forceGraph.element.addEventListener('pointermove', event => {
        pointerMove(event, forceGraph);
    });

    document.addEventListener('pointerup', event => {
        if (event.button !== 0) return; // Only left click
        pointerUp(event, forceGraph);
    });

}
