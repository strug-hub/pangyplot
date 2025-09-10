
import { canHighlight } from '../selection-state.js';
import { findNearestNode, euclideanDist } from '../../../utils/node-utils.js';
import { makeHoverLabel } from './hover-label.js';
import { faLabel } from '../../../../utils/node-label.js';
import DEBUG_MODE from '../../../../debug-mode.js';

const MAX_HOVER_DISTANCE = 40;

function getHoverLabelText(node) {
  if (DEBUG_MODE) {
    return faLabel(node.id);
    //return node.iid;
  }

  return faLabel(node.id);
}

function attemptHover(event, forceGraph, tooltip) {
  if (!canHighlight()) {
    tooltip.hide();
    forceGraph.setHighlighted(null);
    forceGraph.setHoveredNode(null);
    return;
  }

  const coords = { x: event.offsetX, y: event.offsetY };
  const graphCoords = forceGraph.screen2GraphCoords(coords.x, coords.y);
  const nodes = forceGraph.graphData().nodes;

  const nearestNode = findNearestNode(nodes, graphCoords);
  if (!nearestNode) {
    forceGraph.setHighlighted(null);
    forceGraph.setHoveredNode(null);
    tooltip.hide();
    return;
  }

  const screenPos = forceGraph.graph2ScreenCoords(nearestNode.x, nearestNode.y);
  const distPx = euclideanDist(coords, screenPos);

  if (distPx > MAX_HOVER_DISTANCE) {
    forceGraph.setHighlighted(null);
    forceGraph.setHoveredNode(null);
    tooltip.hide();
    return;
  }

  forceGraph.setHighlighted([nearestNode]);
  forceGraph.setHoveredNode(nearestNode);

  const labelText = getHoverLabelText(nearestNode);
  tooltip.show(labelText, event.clientX, event.clientY);
}

export default function setUpHoverEngine(forceGraph) {

  forceGraph.hoveredNode = null;

  forceGraph.setHoveredNode = function (node) {
    //if (this.hoveredNode === node) return;
    this.hoveredNode = node;
    //eventBus.publish('graph:hovered-changed', node);
    
  };

  const container = forceGraph.element.parentElement || forceGraph.element;
  const tooltip = makeHoverLabel(container);

  forceGraph.element.addEventListener('pointermove', (event) => {
    attemptHover(event, forceGraph, tooltip);
  });

}