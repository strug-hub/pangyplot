
import { canHighlight } from '../selection-state.js';
import { findNearestNode, euclideanDist } from '../../../utils/node-utils.js';
import { makeHoverLabel } from './hover-label.js';
import { formatNodeLabel } from '@format-utils';
import appState from '../../../app-state.js';
import { isPanning } from '../../../engines/navigation/pan-zoom/pan-zoom-engine.js';
import { formatBp } from '@format-utils';

const MAX_HOVER_DISTANCE = 40;

const TYPE_COLORS = {
    simple: '#4a90d9',
    superbubble: '#d94a90',
    insertion: '#44bb44',
    deletion: '#bb4444',
    segment: '#0762E5',
    bubble: '#F2DC0F',
};

function row(label, value, color) {
    const style = color ? ` style="color:${color}"` : '';
    return `<span class="tt-label">${label}</span> <span class="tt-val"${style}>${value}</span>`;
}

function getHoverTooltipHtml(node) {
  const record = node.record;
  const lines = [];

  if (node.type === 'segment') {
    lines.push(row('segment', formatNodeLabel(node.id)));
  } else if (node.type === 'bubble') {
    lines.push(row('bubble', formatNodeLabel(node.id)));
  }

  if (record) {
    if (record.subtype) {
      lines.push(row('type', record.subtype, TYPE_COLORS[record.subtype]));
    }
    const len = formatBp(record.seqLength, { unit: true });
    if (len) lines.push(row('length', len));
    if (record.chain != null) {
      lines.push(row('chain', record.chain));
    }
    if (record.size != null) {
      lines.push(row('size', record.size));
    }
  }

  return lines.join('<br>');
}

function clearHover(forceGraph, tooltip) {
  const wasHovering = appState.hoveredNode != null;
  appState.setHighlighted(null);
  appState.setHoveredNode(null);
  tooltip.hide();
  if (wasHovering && !isPanning() && !appState.isBubblePopMode()) {
    forceGraph.element.style.setProperty('--graph-cursor',
      appState.isPanZoomMode() ? 'grab' : 'default');
  }
}

function attemptHover(event, forceGraph, tooltip) {
  if (!canHighlight()) {
    clearHover(forceGraph, tooltip);
    return;
  }

  const coords = { x: event.offsetX, y: event.offsetY };
  const graphCoords = forceGraph.screen2GraphCoords(coords.x, coords.y);
  const nodes = forceGraph.graphData().nodes;

  const nearestNode = findNearestNode(nodes, graphCoords);
  if (!nearestNode) {
    clearHover(forceGraph, tooltip);
    return;
  }

  const screenPos = forceGraph.graph2ScreenCoords(nearestNode.x, nearestNode.y);
  const distPx = euclideanDist(coords, screenPos);

  if (distPx > MAX_HOVER_DISTANCE) {
    clearHover(forceGraph, tooltip);
    return;
  }

  appState.setHighlighted([nearestNode]);
  appState.setHoveredNode(nearestNode);

  if (!isPanning() && !appState.isBubblePopMode()) {
    forceGraph.element.style.setProperty('--graph-cursor',
      appState.isSelectionMode() ? 'grab' : 'default');
  }

  tooltip.show(getHoverTooltipHtml(nearestNode), event.clientX, event.clientY);
}

export default function setUpHoverEngine(forceGraph) {

  const container = forceGraph.element.parentElement || forceGraph.element;
  const tooltip = makeHoverLabel(container);

  forceGraph.element.addEventListener('pointermove', (event) => {
    attemptHover(event, forceGraph, tooltip);
  });

}
