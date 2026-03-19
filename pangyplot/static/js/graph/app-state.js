import eventBus from '../utils/event-bus.js';
import NodeSet from './utils/node-set.js';

function toCamelCase(name) {
    return name
        .split(/[-_\s]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
}

const appState = {
    coords: { genome: null, chromosome: null, start: null, end: null },
    selected: new NodeSet("selected"),
    highlighted: new NodeSet("highlighted"),
    hoveredNode: null,
    draggedNode: null,
    fixOnDrag: false,
    mode: "pan-zoom",
    modes: [],
    defaultMode: { mode: "pan-zoom", keyCheck: null, cursor: "grab" },

    setSelected(nodes) {
        if (nodes == null) {
            this.selected.clear();
        } else {
            if (this.selected.contains(nodes)) return;
            this.selected.clear();
            this.selected.addAll(nodes);
        }
        eventBus.publish('graph:selection-changed', nodes);
    },

    setHighlighted(nodes) {
        if (nodes == null) {
            this.highlighted.clear();
        } else {
            if (this.highlighted.contains(nodes)) return;
            this.highlighted.clear();
            this.highlighted.addAll(nodes);
        }
        eventBus.publish('graph:highlighted-changed', nodes);
    },

    setHoveredNode(node) {
        if (this.hoveredNode === node) return;
        this.hoveredNode = node;
        eventBus.publish('graph:hovered-changed', node);
    },

    setDraggedNode(node) {
        if (this.draggedNode === node) return;
        this.draggedNode = node;
        eventBus.publish('graph:dragged-changed', node);
    },

    isDragging() {
        return this.draggedNode !== null;
    },

    isSelectionMode() {
        return this.mode === "selection";
    },

    isPanZoomMode() {
        return this.mode === "pan-zoom";
    },

    registerMode(modeData) {
        this.modes.push(modeData);
        const fnName = `is${toCamelCase(modeData.mode)}Mode`;
        this[fnName] = function () {
            return appState.mode === modeData.mode;
        };
    },
};

export default appState;
