import { popUndoStack } from './bubble-pop-queue.js';
import { unpopBubble } from '../../graph-data/graph-manager.js';

export function undoBubblePop(forceGraph) {
    const bubbleId = popUndoStack();
    if (!bubbleId) return;

    unpopBubble(bubbleId);
    /*
    const unpoppedContents = getUnpoppedContents(bubbleId);
    const poppedContents = getPoppedContents(bubbleId, true);
    console.log("Undoing bubble pop for:", bubbleId, unpoppedContents, poppedContents);
    
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
    */
}