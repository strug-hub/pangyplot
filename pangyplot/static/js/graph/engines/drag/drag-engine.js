import eventBus from '../../../utils/event-bus.js';
import { dragState, isDragging, setDraggedNode, clearDraggedNode } from './drag-state.js';
import dragInfluenceForce from './drag-force.js';
import { euclideanDist } from '../../utils/node-utils.js';
import { numberSelected, isSelected, clearSelected, updateHighlighted, getHoverNode } from '../selection/selection-state.js';

const MAX_DRAG_DISTANCE = 25;
const MIN_DRAG_DETECT = 5;

function setDragStart(event, forceGraph) {
    const hoverNode = getHoverNode();
    if (!hoverNode) return;

    const coords = { x: event.offsetX, y: event.offsetY };
    const screenPos = forceGraph.graph2ScreenCoords(hoverNode.x, hoverNode.y);
    const distPx = euclideanDist(coords, screenPos);

    if (distPx > MAX_DRAG_DISTANCE) return;

    dragState.readyNode = hoverNode;
    dragState.initialMousePos = { x: event.offsetX, y: event.offsetY };
}

function checkIfDragging(event) {
  const coords = { x: event.offsetX, y: event.offsetY };
  const distPx = euclideanDist(dragState.initialMousePos, coords);

  if (distPx > MIN_DRAG_DETECT) {
    const node = dragState.readyNode;
    dragState.readyNode = null;

    setDraggedNode(node);
    if (!isSelected(node)) clearSelected();
    updateHighlighted([node.nodeId]);
    eventBus.publish('drag:node', { node });
  }
}

function updateDrag(event, forceGraph) {
  const node = dragState.draggedNode;
  if (!node) return;

  const { x, y } = forceGraph.screen2GraphCoords(event.offsetX, event.offsetY);
  node.x = x;
  node.y = y;
  node.fx = x;
  node.fy = y;

  eventBus.publish('drag:node', { node });
  forceGraph.d3ReheatSimulation();
}

function onDragEnd() {
    const node = dragState.draggedNode;
    if (!node) return;

    if (dragState.fixAfterDrag && numberSelected() < 2) {
      node.isFixed = true;
      node.fx = node.x;
      node.fy = node.y;
    } else {
      node.fx = undefined;
      node.fy = undefined;
    }

    clearDraggedNode();
    eventBus.publish('drag:end', { node });
}


export default function setUpDragEngine(forceGraph, canvasElement) {

  forceGraph.d3Force('dragInfluence', dragInfluenceForce(forceGraph));

  canvasElement.addEventListener('pointerdown', event => {
    if (event.button !== 0) return; // Only left click
    setDragStart(event, forceGraph);
  });

  canvasElement.addEventListener('pointermove', event => {
    if (dragState.readyNode != null){
      checkIfDragging(event);
    } else if (isDragging()) {
      updateDrag(event, forceGraph);
    }
  });

  canvasElement.addEventListener('pointerup', event => {
    dragState.readyNode = null;
    if (isDragging()) {
      onDragEnd(event);
    }
  });

  document.addEventListener('wheel', e => {
    if (!dragState.draggedNode) return;
    dragState.decay = e.deltaY > 0
      ? Math.max(dragState.decay - 0.005, 0.01)
      : Math.min(dragState.decay + 0.005, 0.1);
  });
}
