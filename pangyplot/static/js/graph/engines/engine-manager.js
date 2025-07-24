import setUpDragEngine from './drag/drag-engine.js';
import setUpSelectionEngine from './selection/selection-engine.js';

export default function setUpEngineManager(forceGraph, canvasElement) {
    setUpDragEngine(forceGraph, canvasElement);
    setUpSelectionEngine(forceGraph, canvasElement);

}