import { popUndoStack } from './bubble-pop-queue.js';
import { unpopBubble } from '../../graph-data/graph-manager.js';

export function undoBubblePop(forceGraph) {
    const bubbleId = popUndoStack();
    if (!bubbleId) return;
    unpopBubble(bubbleId);
}