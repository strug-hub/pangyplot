import eventBus from '../../../utils/event-bus.js';
import { isPanZoomMode } from '../navigate/pan-zoom-engine.js';
import { isDragging } from '../drag/drag-state.js';

export const selectionState = {
  multiSelectMode: false,
  bubbleMode: false,

  hoverNode: null,
  highlighted: new Set(),
  selected: new Set()
};

export function updateSelected(nodes) {
  if (isPanZoomMode()) return;
  const oldSelected = selectionState.selected;
  selectionState.selected = new Set(nodes);

  if (!setsEqual(oldSelected, selectionState.selected)) {
    eventBus.publish('selection:changed', selectionState);
  }
}

export function clearSelected() {
  if (isPanZoomMode()) return;
  selectionState.selected = new Set();
}

export function updateHoverNode(node) {
  selectionState.hoverNode = node;
}

export function updateHighlighted(nodes) {
  const oldHighlighted = selectionState.highlighted;
  selectionState.highlighted = new Set(nodes);

  if (!setsEqual(oldHighlighted, selectionState.highlighted)) {
    eventBus.publish('selection:highlight-changed', selectionState);
  }
}

export function clearHighlighted() {
  selectionState.highlighted = new Set();
  updateHoverNode(null);
}

export function numberSelected() {
  return selectionState.selected.size;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

export function flipBubbleMode() {
  selectionState.bubbleMode = !selectionState.bubbleMode;
  eventBus.publish('selection:bubble-mode-toggled', selectionState.bubbleMode);
}

export function isInBubbleMode() {
  return selectionState.bubbleMode;
}

export function canSingleSelect() {
  return !selectionState.multiSelectMode && !isPanZoomMode();
}

export function canHighlight() {
  return !selectionState.multiSelectMode && !isPanZoomMode() && !isDragging();
}

export function getSelected() {
  return [...selectionState.selected];
}

export function isSelected(node) {
  return selectionState.selected.has(node);
}

export function getHighlighted() {
  return [...selectionState.highlighted];
}

export function getHoverNode() {
  return selectionState.hoverNode;
}
