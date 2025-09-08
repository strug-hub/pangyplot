import { popUndoStack } from './bubble-pop-queue.js';
import { unpopBubble } from '../../data/graph-data-manager.js';

export function undoBubblePop(forceGraph) {
    const bubbleId = popUndoStack();
    if (!bubbleId) return;
    unpopBubble(bubbleId);
}