export class MultiSelectionBox {
  constructor() {
    this.startBox = null;
    this.activeBox = null;
  }

  beginBox(x, y) {
    this.startBox = { x, y };
    this.activeBox = null;
  }

  updateBox(x, y) {
    if (!this.startBox) return null;
    this.activeBox = { x, y };
    return this.getBoxBounds();
  }

  clearBox() {
    this.startBox = null;
    this.activeBox = null;
  }

  getBoxBounds() {
    if (!this.startBox || !this.activeBox) return null;
    return {
      left: Math.min(this.startBox.x, this.activeBox.x),
      top: Math.min(this.startBox.y, this.activeBox.y),
      right: Math.max(this.startBox.x, this.activeBox.x),
      bottom: Math.max(this.startBox.y, this.activeBox.y),
    };
  }
}

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

