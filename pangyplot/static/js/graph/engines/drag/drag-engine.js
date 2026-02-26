import setUpDragFixEngine from './drag-fix/drag-fix-engine.js';
import { setUpDragInfluenceEngine } from './drag-influence/drag-influence-engine.js';
import { euclideanDist } from '../../utils/node-utils.js';
import appState from '../../app-state.js';

const MAX_DISTANCE_DRAG_DETECT_PX = 25;
const MIN_MOVEMENT_INITIATION_PX = 5;
const DRAG_CURSOR = 'grabbing';

var initialMousePos = { x: null, y: null };
var readyNode = null;

function setDragStart(event, forceGraph) {
    const hoveredNode = appState.hoveredNode;
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

    forceGraph.element.style.cursor = DRAG_CURSOR;

    if (!appState.selected.has(node)) {
      appState.setSelected(null);
    }
    appState.setHighlighted([node]);
    appState.setDraggedNode(node);
  }
}

function updateDrag(event, forceGraph) {
  const node = appState.draggedNode;
  if (!node) return;

  const { x, y } = forceGraph.screen2GraphCoords(event.offsetX, event.offsetY);
  node.x = x;
  node.y = y;
  node.fx = x;
  node.fy = y;

  forceGraph.d3ReheatSimulation();
}

function onDragEnd(event, forceGraph) {

    if (forceGraph.element.style.cursor === DRAG_CURSOR)
      forceGraph.element.style.cursor = 'default';

    const node = appState.draggedNode;
    if (!node) return;

    if (appState.fixOnDrag && appState.selected.size < 2) {
      node.fx = node.x;
      node.fy = node.y;
    } else {
      node.fx = undefined;
      node.fy = undefined;
    }

    appState.setDraggedNode(null);
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
    } else if (appState.isDragging()) {
      updateDrag(event, forceGraph);
    }
  });

  forceGraph.element.addEventListener('pointerup', event => {
    readyNode = null;
    if (appState.isDragging()) {
      onDragEnd(event, forceGraph);
    }
  });
}
