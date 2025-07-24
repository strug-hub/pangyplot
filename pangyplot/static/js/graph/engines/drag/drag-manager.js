import eventBus from '../../../input/event-bus.js';

export default function dragManager() {
    let draggedNode = null;
    let fixAfterDrag = true;

    // Listen for UI toggle
    eventBus.subscribe('anchor-node-changed', value => {
        fixAfterDrag = value;
    });

    function isDragging() {
        return draggedNode !== null;
    }

    function getDraggedNode() {
        return draggedNode;
    }

    function nodeDragged(node) {
        draggedNode = node;
        eventBus.publish('drag:node', { node });
    }

    function nodeDragEnd(node) {
        draggedNode = null;
        if (fixAfterDrag) {
            node.fx = node.x;
            node.fy = node.y;
        }
    }

    function setup(forceGraph) {
        forceGraph
            .onNodeDrag(node => nodeDragged(node))
            .onNodeDragEnd(node => nodeDragEnd(node));
    }

    return {
        setup,
        isDragging,
        getDraggedNode
    };
}