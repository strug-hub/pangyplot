import forceGraph from '../../force-graph.js';

export const selectionState = {
  multiSelectMode: false,
  chainMode: false,
};

export function flipChainMode() {
  selectionState.chainMode = !selectionState.chainMode;
}

export function isInChainMode() {
  return selectionState.chainMode;
}

export function canSingleSelect() {
  console.log("canSingleSelect", !selectionState.multiSelectMode, forceGraph.isSelectionMode());
  return !selectionState.multiSelectMode && forceGraph.isSelectionMode();
}

export function canHighlight() {
  return !selectionState.multiSelectMode && forceGraph.isSelectionMode() && !forceGraph.isDragging();
}
