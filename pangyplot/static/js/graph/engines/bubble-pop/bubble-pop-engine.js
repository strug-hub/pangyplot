import setUpUndoPopEngine from './undo-pop/undo-pop-engine.js';
import setUpSinglePopEngine from './single-pop/single-pop-engine.js';
import { popBubble, popBubbles } from './bubble-pop.js';

export default function setUpBubblePopEngine(forceGraph) {
    const bubblePopMode = {
        mode: "bubble-pop",
        keyCheck: e => e.ctrlKey || e.metaKey,
        cursor: "pointer",
    };

    forceGraph.registerMode(bubblePopMode);

    forceGraph.popBubble = (bubble) => popBubble(bubble);
    forceGraph.popBubbles = (bubbles) => popBubbles(bubbles);

    setUpSinglePopEngine(forceGraph);
    setUpUndoPopEngine(forceGraph);
}

