import setUpDragFixEngine from './drag-fix/drag-fix-engine.js';
import { setUpDragInfluenceEngine } from './drag-influence/drag-influence-engine.js';
import { euclideanDist } from '../../utils/node-utils.js';

const MAX_DISTANCE_DRAG_DETECT_PX = 25;
const MIN_MOVEMENT_INITIATION_PX = 5;

var initialMousePos = { x: null, y: null };
var readyNode = null;

function setDragStart(event, forceGraph) {
    const hoveredNode = forceGraph.hoveredNode;
    if (!hoveredNode) return;

    const coords = { x: event.offsetX, y: event.offsetY };
    const screenPos = forceGraph.graph2ScreenCoords(hoveredNode.x, hoveredNode.y);
    const distPx = euclideanDist(coords, screenPos);

    if (distPx > MAX_DISTANCE_DRAG_DETECT_PX) return;

    readyNode = hoveredNode;
    initialMousePos = { x: event.offsetX, y: event.offsetY };
}

function checkIfDragging(event, forceGraph) {
  const coords = { x: event.offsetX, y: event.offsetY };
  const distPx = euclideanDist(initialMousePos, coords);

  if (distPx > MIN_MOVEMENT_INITIATION_PX) {
    const node = readyNode;
    readyNode = null;

    if (!forceGraph.selected.has(node)) {
      forceGraph.setSelected(null);
    }
    forceGraph.setHighlighted([node]);
    forceGraph.setDraggedNode(node);
  }
}

function updateDrag(event, forceGraph) {
  const node = forceGraph.draggedNode;
  if (!node) return;

  const { x, y } = forceGraph.screen2GraphCoords(event.offsetX, event.offsetY);
  node.x = x;
  node.y = y;
  node.fx = x;
  node.fy = y;

  forceGraph.d3ReheatSimulation();
}

function onDragEnd(event, forceGraph) {
    const node = forceGraph.draggedNode;
    if (!node) return;

    if (forceGraph.fixOnDrag && forceGraph.selected.size < 2) {
      node.isFixed = true;
      node.fx = node.x;
      node.fy = node.y;
    } else {
      node.fx = undefined;
      node.fy = undefined;
    }

    forceGraph.setDraggedNode(null);
}

export default function setUpDragEngine(forceGraph) {
  
  setUpDragFixEngine(forceGraph);
  setUpDragInfluenceEngine(forceGraph);

  forceGraph.element.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    setDragStart(event, forceGraph);
  });

  forceGraph.element.addEventListener('pointermove', event => {
    if (readyNode != null){
      checkIfDragging(event, forceGraph);
    } else if (forceGraph.isDragging()) {
      updateDrag(event, forceGraph);
    }
  });

  forceGraph.element.addEventListener('pointerup', event => {
    readyNode = null;
    if (forceGraph.isDragging()) {
      onDragEnd(event, forceGraph);
    }
  });
}
