import appState from '../../app-state.js';

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
  return !selectionState.multiSelectMode && appState.isSelectionMode();
}

export function canHighlight() {
  return !selectionState.multiSelectMode && !appState.isPanZoomMode() && !appState.isDragging();
}
