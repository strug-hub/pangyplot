export const dragState = {
  draggedNode: null,
  fixAfterDrag: true,
  previousPos: { x: null, y: null },
  decay: 0.05,
  cache: null
};

export function setDraggedNode(node) {
  dragState.draggedNode = node;
  dragState.previousPos = { x: null, y: null };
  dragState.cache = null;
}

export function clearDraggedNode() {
  dragState.draggedNode = null;
  dragState.previousPos = { x: null, y: null };
  dragState.cache = null;
}
