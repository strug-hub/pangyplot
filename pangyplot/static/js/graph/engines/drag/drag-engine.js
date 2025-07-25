import eventBus from '../../../input/event-bus.js';
import { dragState, setDraggedNode, clearDraggedNode } from './drag-state.js';
import dragInfluenceForce from './drag-force.js';
import { findNearestNode, euclideanDist } from '../../utils/node-utils.js';

const MAX_DRAG_DISTANCE = 25;
let prevMouse = null;

function attemptDrag(event, forceGraph) {
  if (event.button !== 0) return; // Only left click

  const coords = { x: event.offsetX, y: event.offsetY };
  const graphCoords = forceGraph.screen2GraphCoords(coords.x, coords.y);
  const nodes = forceGraph.graphData().nodes;
  const nearestNode = findNearestNode(nodes, graphCoords);
  if (!nearestNode) return;

  const screenPos = forceGraph.graph2ScreenCoords(nearestNode.x, nearestNode.y);
  const distPx = euclideanDist(coords, screenPos);

  if (distPx < MAX_DRAG_DISTANCE) {
    setDraggedNode(nearestNode);
    prevMouse = coords;
    console.log("Drag target set to node:", nearestNode);
  }
}

function updateDrag(event, forceGraph) {
  if (!dragState.draggedNode || !prevMouse) return;

  const { offsetX, offsetY } = event;
  const dxScreen = offsetX - prevMouse.x;
  const dyScreen = offsetY - prevMouse.y;
  prevMouse = { x: offsetX, y: offsetY };

  // Convert delta to graph coordinates based on current zoom
  const zoom = forceGraph.zoom();
  const dxGraph = dxScreen / zoom;
  const dyGraph = dyScreen / zoom;

  // Move the dragged node directly
  dragState.draggedNode.x += dxGraph;
  dragState.draggedNode.y += dyGraph;

  // Multi-selection: Move other selected nodes by same delta
  forceGraph.graphData().nodes.forEach(node => {
    if (node !== dragState.draggedNode && node.isSelected) {
      node.x += dxGraph;
      node.y += dyGraph;

      if (node.isFixed) {
        node.fx += dxGraph;
        node.fy += dyGraph;
      }
    }
  });

  // Keep simulation active but stable

  eventBus.publish('drag:node', { node: dragState.draggedNode });
}


function finishDrag(event, forceGraph) {
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
      const node = dragState.draggedNode;
      node.isFixed = true;
      node.fx = node.x;
      node.fy = node.y;
    }
  }
  prevMouse = null;
  
  clearDraggedNode();
}

export default function setUpDragEngine(forceGraph, canvasElement) {

  forceGraph.enableNodeDrag(false);
  forceGraph.d3Force('dragInfluence', dragInfluenceForce(forceGraph));

  canvasElement.addEventListener('pointerdown', (event) => {
    attemptDrag(event, forceGraph);
  });

  canvasElement.addEventListener('pointermove', (event) => {
    updateDrag(event, forceGraph);
  });

  canvasElement.addEventListener('pointerup', (event) => {
    finishDrag(event, forceGraph);
  });

  eventBus.subscribe('ui:anchor-node-changed', value => {
    dragState.fixAfterDrag = value;
  });

  document.addEventListener('wheel', (event) => {
    if (!dragState.draggedNode) return;

    if (event.deltaY > 0) {
      dragState.decay = Math.max(dragState.decay - 0.005, 0.01);
    } else {
      dragState.decay = Math.min(dragState.decay + 0.005, 0.1);
    }
  });

}
