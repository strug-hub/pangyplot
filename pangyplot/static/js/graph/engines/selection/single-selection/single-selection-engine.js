import DEBUG_MODE from '../../../../debug-mode.js';
import { canSingleSelect } from '../selection-state.js';
import { euclideanDist } from '../../../utils/node-utils.js';

const MAX_SELECT_DISTANCE = 25;

function attemptSelection(event, forceGraph) {
    if (!canSingleSelect()) return;

    const hoveredNode = forceGraph.hoveredNode;
    if (!hoveredNode) return;

    const coords = { x: event.offsetX, y: event.offsetY };
    const screenPos = forceGraph.graph2ScreenCoords(hoveredNode.x, hoveredNode.y);
    const distPx = euclideanDist(coords, screenPos);

    if (distPx > MAX_SELECT_DISTANCE) return;

    if (DEBUG_MODE) {
        console.log("[single-selection-engine] clicked:", hoveredNode);
        const connectedEdges = forceGraph.graphData().links.filter(link =>
            link.source === hoveredNode || link.target === hoveredNode
        );
        console.log("[single-selection-engine] links:", connectedEdges);
    }

      forceGraph.setSelected([hoveredNode]);
      forceGraph.setHighlighted(null);
    }

export default function setUpSingleSelectEngine(forceGraph) {

    forceGraph.element.addEventListener('pointerup', (event) => {
        if (event.button !== 0) return;
        attemptSelection(event, forceGraph);
    });
}