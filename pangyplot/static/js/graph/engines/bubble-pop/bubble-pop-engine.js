import setUpUndoPopEngine from './undo-pop/undo-pop-engine.js';
import setUpSinglePopEngine from './single-pop/single-pop-engine.js';
import { popBubble, popBubbles } from './bubble-pop.js';
import appState from '../../app-state.js';

export default function setUpBubblePopEngine(forceGraph) {
    const bubblePopMode = {
        mode: "bubble-pop",
        keyCheck: e => e.ctrlKey || e.metaKey,
        cursor: "pointer",
    };

    appState.registerMode(bubblePopMode);

    forceGraph.popBubble = (bubble) => popBubble(bubble, forceGraph);
    forceGraph.popBubbles = (bubbles) => popBubbles(bubbles, forceGraph);

    setUpSinglePopEngine(forceGraph);
    setUpUndoPopEngine(forceGraph);
}
