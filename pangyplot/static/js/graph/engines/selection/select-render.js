import { colorState } from "../../render/color/color-state.js";
import { outlineNode, outlineLink } from "../../render/painter/painter-utils.js";

export function highlightSelection(ctx, graphData) {
  ctx.save();

  const zoomFactor = ctx.canvas.__zoom.k;
  const highlightWidth = 50 + 10 / zoomFactor;

  graphData.nodes.forEach(node => {
    
    if (node.isSingleton) {
      const hsize = node.width + highlightWidth;

      if (node.isSelected) {
        outlineNode(node, ctx, 0, hsize, colorState.selectedNode);
      } else if (node.isHighlighted) {
        outlineNode(node, ctx, 0, hsize, colorState.highlightNode);
      } 
    }
  });

  graphData.links.forEach(link => {
    if (!link.class === "node") {
      const hsize = link.width + highlightWidth;

      if (link.isSelected) {
        outlineLink(link, ctx, 0, hsize, colorState.selectedNode);
      } else if (link.isHighlighted) {
        outlineLink(link, ctx, 0, hsize, colorState.highlightNode);
      } 
    }
  });

  ctx.restore();
}
