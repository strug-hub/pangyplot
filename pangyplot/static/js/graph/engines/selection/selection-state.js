import eventBus from '../../../utils/event-bus.js';
import { isPanZoomMode } from '../navigate/pan-zoom-engine.js';
import { isDragging } from '../drag/drag-state.js';
import NodeSet from '../../utils/node-set.js';

export const selectionState = {
  multiSelectMode: false,
  chainMode: false,

  hoverNode: null,
  highlighted: new NodeSet("highlighted"),
  selected: new NodeSet("selected")
};

export function updateSelected(nodes) {
  if (isPanZoomMode()) return;
  const oldSelected = selectionState.selected;
  selectionState.selected = new NodeSet("selected", nodes);

  if (!oldSelected.sameNodes(selectionState.selected)) {
    eventBus.publish('selection:changed', selectionState);
  }
}

export function clearSelected() {
  if (isPanZoomMode()) return;
  selectionState.selected.clear();
}

export function updateHoverNode(node) {
  selectionState.hoverNode = node;
}

export function updateHighlighted(nodes) {
  selectionState.highlighted = new NodeSet("highlighted", nodes);
}

export function clearHighlighted() {
  selectionState.highlighted.clear();
  updateHoverNode(null);
}

export function numberSelected() {
  return selectionState.selected.size;
}

export function flipChainMode() {
  selectionState.chainMode = !selectionState.chainMode;
}

export function isInChainMode() {
  return selectionState.chainMode;
}

export function canSingleSelect() {
  return !selectionState.multiSelectMode && !isPanZoomMode();
}

export function canHighlight() {
  return !selectionState.multiSelectMode && !isPanZoomMode() && !isDragging();
}

export function getSelectedNodeSet() {
  return selectionState.selected;
}

export function isSelected(node) {
  return selectionState.selected.has(node);
}

export function getHighlightedNodeSet() {
  return selectionState.highlighted;
}

export function getHoverNode() {
  return selectionState.hoverNode;
}
