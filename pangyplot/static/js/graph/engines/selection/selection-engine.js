import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import setUpHoverEngine from './hover/hover-engine.js';
import setUpSingleSelectEngine from './single-selection/single-selection-engine.js';
import setUpCancelSelectionEngine from './cancel-selection/cancel-selection-engine.js';
import appState from '../../app-state.js';

export default function setUpSelectionEngine(forceGraph) {

    appState.registerMode({
        mode: "selection",
        keyCheck: e => e.shiftKey,
        cursor: "default",
    });

    setUpHoverEngine(forceGraph);
    setUpSingleSelectEngine(forceGraph);
    setUpMultiSelectionEngine(forceGraph);
    setUpCancelSelectionEngine(forceGraph);
}
