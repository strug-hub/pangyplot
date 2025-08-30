import setUpDragEngine from './drag/drag-engine.js';
import setUpSelectionEngine from './selection/selection-engine.js';
import setUpPanZoomEngine from './navigate/pan-zoom-engine.js';
import setUpRecenterEngine from './navigate/recenter-engine.js';
import setupRightClickMenu from './right-click/right-click-engine.js';
import setupBubblePopEngine from './bubble-pop/bubble-pop-engine.js';
import setUpSequenceSearchEngine from './sequence-search/sequence-search-engine.js';
import setUpGeneAnnotationEngine from './gene-annotation/gene-annotation-engine.js';
import setUpRotationEngine from './navigate/rotation-engine.js';

export default function setUpEngineManager(forceGraph, canvasElement) {
    setUpDragEngine(forceGraph, canvasElement);
    setUpSelectionEngine(forceGraph, canvasElement);
    setUpPanZoomEngine(forceGraph, canvasElement);
    setUpRecenterEngine(forceGraph, canvasElement);
    setUpRotationEngine(forceGraph, canvasElement);
    setupRightClickMenu(forceGraph, canvasElement);
    setupBubblePopEngine(forceGraph, canvasElement);
    setUpSequenceSearchEngine(forceGraph, canvasElement);
    setUpGeneAnnotationEngine(forceGraph, canvasElement);
}