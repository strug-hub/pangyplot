import { colorState } from "../../render/color/color-state.js";
import { isSelected, isHighlighted } from "./selection-state.js";
import { outlineNode, outlineLink } from "../../render/painter/painter-utils.js";

export function highlightSelection(ctx, graphData) {
  ctx.save();

  const zoomFactor = ctx.canvas.__zoom.k;
  const highlightWidth = 50 + 10 / zoomFactor;

  graphData.nodes.forEach(node => {
    if (node.isSingleton) {
      const hsize = node.width + highlightWidth;
    
      if (isSelected(node)) {
        outlineNode(node, ctx, 0, hsize, colorState.selectedNode);
      } else if (isHighlighted(node)) {
        outlineNode(node, ctx, 0, hsize, colorState.highlightNode);
      } 
    }
  });

  graphData.links.forEach(link => {
    if (!link.class === "node") {
      const hsize = link.width + highlightWidth;

      if (isSelected(link)) {
        outlineLink(link, ctx, 0, hsize, colorState.selectedNode);
      } else if (isHighlighted(link)) {
        outlineLink(link, ctx, 0, hsize, colorState.highlightNode);
      } 
    }
  });

  ctx.restore();
}
