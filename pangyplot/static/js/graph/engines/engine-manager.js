import setUpDragEngine from './drag/drag-engine.js';
import setUpSelectionEngine from './selection/selection-engine.js';
import setUpPanZoomEngine from './navigate/pan-zoom-engine.js';

export default function setUpEngineManager(forceGraph, canvasElement) {
    setUpDragEngine(forceGraph, canvasElement);
    setUpSelectionEngine(forceGraph, canvasElement);
    setUpPanZoomEngine(forceGraph, canvasElement);
}