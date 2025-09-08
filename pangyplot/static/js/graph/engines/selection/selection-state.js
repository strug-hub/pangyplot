import forceGraph from '../../force-graph.js';

export const selectionState = {
  multiSelectMode: false,
  chainMode: false,

  hoverNode: null,
};

export function updateSelected(nodes) {
  if (forceGraph.isPanZoomMode()) return;
  forceGraph.setSelected(nodes);
}

export function clearSelected() {
  if (forceGraph.isPanZoomMode()) return;
  forceGraph.selected.clear();
}

export function updateHoverNode(node) {
  forceGraph.setHoveredNode(node);
}

export function updateHighlighted(nodes) {
  forceGraph.setHighlighted(nodes);
}

export function clearHighlighted() {
  forceGraph.highlighted.clear();
  forceGraph.setHoveredNode(null);
}

export function flipChainMode() {
  selectionState.chainMode = !selectionState.chainMode;
}

export function isInChainMode() {
  return selectionState.chainMode;
}

export function canSingleSelect() {
  return !selectionState.multiSelectMode && !forceGraph.isPanZoomMode();
}

export function canHighlight() {
  return !selectionState.multiSelectMode && !forceGraph.isPanZoomMode() && !forceGraph.isDragging();
}

export function getHoverNode() {
  return forceGraph.hoveredNode;
}
