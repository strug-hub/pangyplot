import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import { updateSelectionState } from './selection-state.js';


export default function setUpSelectionEngine(forceGraph, canvasElement) {
    setUpMultiSelectionEngine(forceGraph, canvasElement);
        forceGraph.onEngineTick(() => {
            updateSelectionState(forceGraph.graphData().nodes);
        })


}