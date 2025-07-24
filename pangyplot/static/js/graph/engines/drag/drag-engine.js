import eventBus from '../../../input/event-bus.js';
import { dragState, setDraggedNode, clearDraggedNode } from './drag-state.js';

export default function setUpDragEngine(forceGraph, canvasElement) {
  forceGraph
    .onNodeDrag(node => {
      setDraggedNode(node);
      eventBus.publish('drag:node', { node });
    })
    .onNodeDragEnd(node => {
      if (dragState.fixAfterDrag) {
        node.fx = node.x;
        node.fy = node.y;
      }
      clearDraggedNode();
    });

  document.addEventListener('wheel', (e) => {
    if (!dragState.draggedNode) return;

    if (e.deltaY > 0) {
      dragState.decay = Math.max(dragState.decay - 0.005, 0.01);
    } else {
      dragState.decay = Math.min(dragState.decay + 0.005, 0.1);
    }
  });

  eventBus.subscribe('ui:anchor-node-changed', value => {
    dragState.fixAfterDrag = value;
  });
}
