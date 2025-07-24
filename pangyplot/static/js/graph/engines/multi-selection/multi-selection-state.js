export default class MultiSelectionState {
  constructor() {
    this.startBox = null;
    this.activeBox = null;
    this.blockSingleClick = false;
    this.highlightOnTop = false;
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
