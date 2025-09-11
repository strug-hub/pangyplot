import eventBus from "../../../utils/event-bus.js";
import recordsManager from "../../data/records/records-manager.js";
import { colorState } from "../color/color-state.js";
import { highlightNodePainter, outlineNodePainter } from "../painter/highlight-node-painter.js";
import { highlightLinkPainter } from "../painter/highlight-link-painter.js";

const HIGHLIGHT_THICKNESS = 10;
const SELECTION_THICKNESS = 10;

const HOVER_WIDTH = 12;
const HOVER_THICKNESS = 1.5;

export function renderHoverEffect(forceGraph) {
  const ctx = forceGraph.canvas.ctx;
  ctx.save();

  const hoveredNode = forceGraph.hoveredNode;
  if (forceGraph.hoveredNode){
    outlineNodePainter(ctx, hoveredNode, colorState.hoverColor, HOVER_WIDTH, HOVER_THICKNESS);
  }
  ctx.restore();
}

var selectionCache = {nodes: [], links: []};
export function renderSelectionEffect(forceGraph) {
  const ctx = forceGraph.canvas.ctx;

  for (const node of selectionCache.nodes) {
    highlightNodePainter(ctx, node, colorState.selectedColor, SELECTION_THICKNESS);
  }
  for (const link of selectionCache.links) {
    highlightLinkPainter(ctx, link, colorState.selectedColor, SELECTION_THICKNESS);
  }
}

var highlightCache = {nodes: [], links: []};
export function renderHighlightEffect(forceGraph) {
  const ctx = forceGraph.canvas.ctx;

  for (const node of highlightCache.nodes) {
    highlightNodePainter(ctx, node, colorState.highlightColor, HIGHLIGHT_THICKNESS);
  }
  for (const link of highlightCache.links) {
    highlightLinkPainter(ctx, link, colorState.highlightColor, HIGHLIGHT_THICKNESS);
  }
}

export function setUpHighlightSelectionRenderer(forceGraph) {

function cache(nodes) {
  if (nodes === null) return { nodes: [], links: [] };

  const ids = nodes.map(n => n.id);
  const nodeRecords = recordsManager.getNodes(ids);

  const graphData = recordsManager.extractElementsFromRecords(nodeRecords);

  return { nodes: nodes, links: graphData.links };
}


  eventBus.subscribe('graph:selection-changed', (nodes) => {
    selectionCache = cache(nodes);
  });

  eventBus.subscribe('graph:highlighted-changed', (nodes) => {
    highlightCache = cache(nodes);
  });


}