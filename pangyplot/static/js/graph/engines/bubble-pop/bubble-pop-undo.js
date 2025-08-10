import { popUndoStack } from './bubble-pop-queue.js';
import { deleteNode } from './bubble-pop-engine.js';
import { getUnpoppedContents, getPoppedContents } from '../../graph-data/bubble-manager.js';

export function undoBubblePop(forceGraph) {
    const graphData = forceGraph.graphData();
    const bubbleId = popUndoStack();

    if (!bubbleId) return;

    const unpoppedContents = getUnpoppedContents(bubbleId);
    if (!unpoppedContents) return;

    const poppedContents = getPoppedContents(bubbleId);

    for (const node of poppedContents.nodes) {
        deleteNode(graphData, node.id);
    }

    graphData.nodes.push(...unpoppedContents.nodes);
    
    // Filter links to only those with valid source/target
    const nodeIds = new Set(graphData.nodes.map(n => n.id));
    const validLinks = unpoppedContents.links.filter(link =>
        nodeIds.has(link.sourceId) && nodeIds.has(link.targetId)
    );
    graphData.links.push(...validLinks);
}