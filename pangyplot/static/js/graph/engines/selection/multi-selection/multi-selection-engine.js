import eventBus from '../../../../input/event-bus.js';
import { nodesInBox } from '../../../utils/node-utils.js';

import { MultiSelectionBox, createOverlay, updateOverlay, removeOverlay } from './multi-selection-box.js';

const selectionBox = new MultiSelectionBox();
let overlayElement = null;
let selectionAllowed = true;

function pointerDown(event) {
    if (!selectionAllowed) return;

    selectionBox.beginBox(event.offsetX, event.offsetY);
}

function destroySelectionBox() {
    if (overlayElement) {
        removeOverlay(overlayElement);
        overlayElement = null;
    }
    selectionBox.clearBox();
}

function pointerMove(event, canvasElement, forceGraph) {
    if (!selectionAllowed) return;

    const bounds = selectionBox.updateBox(event.offsetX, event.offsetY);

    if (bounds) {
        if (!overlayElement) overlayElement = createOverlay(canvasElement);
        updateOverlay(overlayElement, bounds);

        // Highlight nodes
        forceGraph.graphData().nodes.forEach(node => node.isHighlighted = false);
        const hitNodes = nodesInBox(forceGraph, bounds);
        hitNodes.forEach(node => node.isHighlighted = true);

    } else if (overlayElement) {
        destroySelectionBox()
    }
}

function pointerUp(event, forceGraph) {
    if (overlayElement) {
        const bounds = selectionBox.getBoxBounds();

        if (bounds) {

            forceGraph.graphData().nodes.forEach(node => node.isSelected = false);
            const hitNodes = nodesInBox(forceGraph, bounds);
            hitNodes.forEach(node => node.isSelected = true);
        }
    }
    destroySelectionBox();
}

export default function setUpMultiSelectionEngine(forceGraph, canvasElement) {

    eventBus.subscribe('drag:node', () => {
        destroySelectionBox();
    });

    canvasElement.addEventListener('pointerdown', e => {
        if (e.button !== 0) return; // Only left click
        pointerDown(e);
    });

    canvasElement.addEventListener('pointermove', e => {
        pointerMove(e, canvasElement, forceGraph);
    });

    document.addEventListener('pointerup', e => {
        if (e.button !== 0) return; // Only left click

        pointerUp(e, forceGraph);
    });

}