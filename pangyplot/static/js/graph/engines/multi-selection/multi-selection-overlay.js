export function createOverlay(container) {
  const box = document.createElement('div');
  box.id = 'box-selection';
  box.style.position = 'absolute';
  box.style.border = '1px dashed #333';
  container.appendChild(box);
  return box;
}

export function updateOverlay(boxElement, bounds) {
  boxElement.style.left = `${bounds.left}px`;
  boxElement.style.top = `${bounds.top}px`;
  boxElement.style.width = `${bounds.right - bounds.left}px`;
  boxElement.style.height = `${bounds.bottom - bounds.top}px`;
}

export function removeOverlay(boxElement) {
  if (boxElement && boxElement.parentNode) {
    boxElement.remove();
  }
}

