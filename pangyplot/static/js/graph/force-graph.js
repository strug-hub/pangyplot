import eventBus from "../utils/event-bus.js";
import NodeSet from "./utils/node-set.js";

const forceGraphElement = document.getElementById("graph");
const forceGraph = ForceGraph()(forceGraphElement);
const forceGraphCanvas = document.querySelector('#graph-container canvas');

forceGraph.element = forceGraphElement;
forceGraph.canvas = forceGraphCanvas;

forceGraph.rotation = 0;

// Define the coordinates for the force graph
forceGraph.coords = { genome: null, chromosome: null, start: null, end: null };
forceGraph.equalsCoords = function ({ genome, chromosome, start, end }) {
    return this.coords.genome === genome &&
        this.coords.chromosome === chromosome &&
        this.coords.start === start &&
        this.coords.end === end;
};

// Helper function to get the drawing context
forceGraphCanvas.ctx = forceGraphCanvas.getContext('2d');
forceGraph.getZoomFactor = function () {
    return this.canvas.__zoom["k"];
}

// Define the input modes for the force graph interaction
const InputModes = Object.freeze({
    SELECTION: 'selection',
    PAN_ZOOM: 'pan-zoom'
});

forceGraph.mode = InputModes.SELECTION;
forceGraph.enableZoomPanInteraction(false);

forceGraph.setPanZoomMode = function () {
    this.enableZoomPanInteraction(true);
    this.mode = InputModes.PAN_ZOOM;
    this.element.style.cursor = 'grabbing';
    eventBus.publish('graph:pan-zoom-mode', true);
};

forceGraph.setSelectionMode = function () {
    this.enableZoomPanInteraction(false);
    this.mode = InputModes.SELECTION;
    this.element.style.cursor = 'default';
    eventBus.publish('graph:selection-mode', true);

};

forceGraph.isPanZoomMode = function () {
    return this.mode === InputModes.PAN_ZOOM;
};

forceGraph.isSelectionMode = function () {
    return this.mode === InputModes.SELECTION;
};

// Node sets for different selection states

forceGraph.highlighted = new NodeSet("highlighted");
forceGraph.selected = new NodeSet("selected");

forceGraph.setSelected = function (nodes) {
    if (nodes == null) {
        this.selected.clear();
    } else {
        if (this.selected.contains(nodes)) return;
        this.selected.clear();
        this.selected.addAll(nodes);
    }
    eventBus.publish('graph:selected-changed', nodes);
};

forceGraph.setHighlighted = function (nodes) {
    if (nodes == null) {
        this.highlighted.clear();
    } else {
        if (this.highlighted.contains(nodes)) return;
        this.highlighted.clear();
        this.highlighted.addAll(nodes);
    }
    eventBus.publish('graph:highlighted-changed', nodes);
};

// Dragging and hovering

forceGraph.draggedNode = null;
forceGraph.hoveredNode = null;

forceGraph.setDraggedNode = function (node) {
    if (this.draggedNode === node) return;
    this.draggedNode = node;
    eventBus.publish('graph:dragged-changed', node);
};

forceGraph.isDragging = function () {
    return this.draggedNode !== null;
};

forceGraph.setHoveredNode = function (node) {
    //if (this.hoveredNode === node) return;
    this.hoveredNode = node;
    //eventBus.publish('graph:hovered-changed', node);
};

forceGraph.fixOnDrag = false;

export default forceGraph;