import { colorState } from "../../render/color/color-state.js";
import { outlineNode, outlineLink } from "../../render/painter/painter-utils.js";
import { getHoverNode } from "./selection-state.js";
import { getNodeComponents } from "../../data/graph-data-manager.js";
import forceGraph from "../../force-graph.js";

export function highlightSelection(graphData) {
  const ctx = graphData.canvas.ctx;
  ctx.save();

  const zoomFactor = graphData.getZoomFactor();
  const highlightWidth = 50 + 10 / zoomFactor;

  const hoverNode = getHoverNode();
  if (hoverNode){
    const hsize = hoverNode.width + highlightWidth;
    
    outlineNode(hoverNode, ctx, 0, hsize, colorState.selectedColor);
  }

  const selectedIds = forceGraph.selected.idList();

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

  const highlightedIds = forceGraph.highlighted.idList();

  for (const id of highlightedIds) {
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
