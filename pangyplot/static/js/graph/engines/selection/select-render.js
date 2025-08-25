import { colorState } from "../../render/color/color-state.js";
import { outlineNode, outlineLink } from "../../render/painter/painter-utils.js";
import { getSelected, getHighlighted, getHoverNode } from "./selection-state.js";
import { getNodeComponents } from "../../graph-data/graph-manager.js";

export function highlightSelection(ctx, graphData) {
  ctx.save();

  const zoomFactor = ctx.canvas.__zoom.k;
  const highlightWidth = 50 + 10 / zoomFactor;

  const hoverNode = getHoverNode();
  if (hoverNode){
    const hsize = hoverNode.width + highlightWidth;
    
    outlineNode(hoverNode, ctx, 0, hsize, colorState.selectedColor);
  }

  const selectedNodes = getSelected();
  const selectedIds = new Set(selectedNodes.map(n => n.id));

  for (const id of selectedIds) {
    const components = getNodeComponents(id);
    for (const node of components.nodes) {
      const hsize = node.width + highlightWidth;
      outlineNode(node, ctx, 0, hsize, colorState.selectedColor);
    }

    for (const link of components.links) {
      const hsize = link.width + highlightWidth;
      outlineLink(link, ctx, 0, hsize, colorState.selectedColor);
    }
  }

  const highlightNode = getHighlighted();
  const highlightIds = new Set(highlightNode.map(n => n.id));

  for (const id of highlightIds) {
    const components = getNodeComponents(id);
    for (const node of components.nodes) {
      const hsize = node.width + highlightWidth * 0.8;
      outlineNode(node, ctx, 0, hsize, colorState.highlightColor);
    }

    for (const link of components.links) {
      const hsize = link.width + highlightWidth * 0.8;
      outlineLink(link, ctx, 0, hsize, colorState.highlightColor);
    }
  }

  ctx.restore();
}
