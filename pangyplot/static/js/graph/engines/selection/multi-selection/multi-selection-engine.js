import eventBus from '../../../../utils/event-bus.js';
import { updateSelected, updateHighlighted, clearHighlighted } from '../selection-state.js';
import { nodesInBox } from '../../../utils/node-utils.js';
import { selectionState } from '../selection-state.js';
import { MultiSelectionBox, createOverlay, updateOverlay, removeOverlay } from './multi-selection-box.js';

const selectionBox = new MultiSelectionBox();
var overlayElement = null;
var selectionAllowed = true;

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

function pointerMove(event, forceGraph) {

    if (forceGraph.isDragging()) {
        destroySelectionBox();
    }
    
    if (!selectionAllowed) return;

    const bounds = selectionBox.updateBox(event.offsetX, event.offsetY);

    if (bounds) {
        selectionState.multiSelectMode = true;
        if (!overlayElement) overlayElement = createOverlay(forceGraph.element);
        updateOverlay(overlayElement, bounds);

        // Highlight nodes
        const hitNodes = nodesInBox(forceGraph, bounds);
        updateHighlighted(hitNodes);

    } else if (overlayElement) {
        destroySelectionBox()
    }
}

function pointerUp(event, forceGraph) {
    if (overlayElement) {
        const bounds = selectionBox.getBoxBounds();

        if (bounds) {
            const hitNodes = nodesInBox(forceGraph, bounds);
            updateSelected(hitNodes);
            clearHighlighted();
        }
    }
    destroySelectionBox();
    setTimeout(() => selectionState.multiSelectMode = false, 0);
}

export default function setUpMultiSelectionEngine(forceGraph) {

    eventBus.subscribe('graph:pan-zoom-mode', () => {
        selectionAllowed = false;
        destroySelectionBox();
    });
    eventBus.subscribe('graph:selection-mode', () => {
        selectionAllowed = true;
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