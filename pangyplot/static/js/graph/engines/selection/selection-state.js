import appState from '../../app-state.js';

export const selectionState = {
  multiSelectMode: false,
};

export function canSingleSelect() {
  return !selectionState.multiSelectMode && appState.isSelectionMode();
}

export function canHighlight() {
  return !selectionState.multiSelectMode && !appState.isDragging();
}
