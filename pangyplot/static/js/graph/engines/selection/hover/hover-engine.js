
import { canHighlight } from '../selection-state.js';
import { findNearestNode, euclideanDist } from '../../../utils/node-utils.js';
import { makeHoverLabel } from './hover-label.js';
import { faLabel } from '../../../../utils/node-label.js';
import DEBUG_MODE from '../../../../debug-mode.js';
import appState from '../../../app-state.js';

const MAX_HOVER_DISTANCE = 40;

function getHoverLabelText(node) {
  if (DEBUG_MODE) {
    const nodeLabel = faLabel(node.id);
    const label = `ID: ${nodeLabel} (x: ${node.x.toFixed(1)}, y: ${node.y.toFixed(1)})`;
    return label;
  }

  return faLabel(node.id);
}

function attemptHover(event, forceGraph, tooltip) {
  if (!canHighlight()) {
    tooltip.hide();
    appState.setHighlighted(null);
    appState.setHoveredNode(null);
    return;
  }

  const coords = { x: event.offsetX, y: event.offsetY };
  const graphCoords = forceGraph.screen2GraphCoords(coords.x, coords.y);
  const nodes = forceGraph.graphData().nodes;

  const nearestNode = findNearestNode(nodes, graphCoords);
  if (!nearestNode) {
    appState.setHighlighted(null);
    appState.setHoveredNode(null);
    tooltip.hide();
    return;
  }

  const screenPos = forceGraph.graph2ScreenCoords(nearestNode.x, nearestNode.y);
  const distPx = euclideanDist(coords, screenPos);

  if (distPx > MAX_HOVER_DISTANCE) {
    appState.setHighlighted(null);
    appState.setHoveredNode(null);
    tooltip.hide();
    return;
  }

  appState.setHighlighted([nearestNode]);
  appState.setHoveredNode(nearestNode);

  const labelText = getHoverLabelText(nearestNode);
  tooltip.show(labelText, event.clientX, event.clientY);
}

export default function setUpHoverEngine(forceGraph) {

  const container = forceGraph.element.parentElement || forceGraph.element;
  const tooltip = makeHoverLabel(container);

  forceGraph.element.addEventListener('pointermove', (event) => {
    attemptHover(event, forceGraph, tooltip);
  });

}
