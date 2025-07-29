import eventBus from '../../../input/event-bus.js';
import { dragState, setDraggedNode, clearDraggedNode } from './drag-state.js';
import dragInfluenceForce from './drag-force.js';

function onNodeDrag(node) {
  setDraggedNode(node);
  eventBus.publish('drag:node', { node });
}

function onNodeDragEnd(forceGraph, node) {
  if (dragState.fixAfterDrag) {
    var numberSelected = 0;
    for (const n of forceGraph.graphData().nodes) {
      if (n.isSelected) {
        numberSelected++;
        if (numberSelected > 1) {
          break;
        }
      }
    }
    // only fix the node if not mult-selected
    if (numberSelected < 2) {
      node.isFixed = true;
      node.fx = node.x;
      node.fy = node.y;
    }
  }
  clearDraggedNode();
}

export default function setUpDragEngine(forceGraph, canvasElement) {

  forceGraph.d3Force('dragInfluence', dragInfluenceForce(forceGraph));

  forceGraph
    .onNodeDrag(onNodeDrag)
    .onNodeDragEnd(node => onNodeDragEnd(forceGraph, node));

  eventBus.subscribe('ui:anchor-node-changed', value => {
    dragState.fixAfterDrag = value;
  });

  document.addEventListener('wheel', (e) => {
    if (!dragState.draggedNode) return;

    if (e.deltaY > 0) {
      dragState.decay = Math.max(dragState.decay - 0.005, 0.01);
    } else {
      dragState.decay = Math.min(dragState.decay + 0.005, 0.1);
    }
  });

}
