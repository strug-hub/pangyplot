import eventBus from '../../../utils/event-bus.js';

export const selectionState = {
  bubbleMode: false,
  highlighted: new Set(),
  selected: new Set()
};

export function numberSelected() {
  return selectionState.selected.size;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

export function updateSelectionState(nodes) {
  // Track old state
  const oldSelected = new Set(selectionState.selected);
  const oldHighlighted = new Set(selectionState.highlighted);

  // Reset state
  selectionState.highlighted.clear();
  selectionState.selected.clear();

  // Rebuild new state
  for (const node of nodes) {
    if (node.isHighlighted) selectionState.highlighted.add(node.nodeId);
    if (node.isSelected) selectionState.selected.add(node.nodeId);
  }

  // Detect changes
  const selectionChanged = !setsEqual(selectionState.selected, oldSelected);
  const highlightChanged = !setsEqual(selectionState.highlighted, oldHighlighted);

  if (selectionChanged) {
    eventBus.publish('selection:changed', selectionState);
  }
  if (highlightChanged) {
    eventBus.publish('selection:highlight-changed', selectionState);
  }
}

export function flipBubbleMode() {
  selectionState.bubbleMode = !selectionState.bubbleMode;
  eventBus.publish('selection:bubble-mode-toggled', selectionState.bubbleMode);
}

export function isInBubbleMode() {
  return selectionState.bubbleMode;
}
