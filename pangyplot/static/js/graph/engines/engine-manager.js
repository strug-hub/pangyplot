import setUpDragEngine from './drag/drag-engine.js';
import setUpSelectionEngine from './selection/selection-engine.js';
import setUpPanZoomEngine from './navigate/pan-zoom-engine.js';
import setUpRecenterEngine from './navigate/recenter-engine.js';
import setupRightClickMenu from './right-click/right-click-engine.js';
import setupBubblePopEngine from './bubble-pop/bubble-pop-engine.js';
import setUpSequenceSearchEngine from './sequence-search/sequence-search-engine.js';
import setUpGeneAnnotationEngine from './gene-annotation/gene-annotation-engine.js';
import setUpRotationEngine from './navigate/rotation-engine.js';
import setUpPathHighlightEngine from './path-highlight/path-highlight-engine.js';
import setUpNodeSearchEngine from './navigate/node-search/node-search-engine.js';

export default function setUpEngineManager(forceGraph) {
    setUpDragEngine(forceGraph);
    setUpSelectionEngine(forceGraph);
    setUpPanZoomEngine(forceGraph);
    setUpRecenterEngine(forceGraph);
    setUpRotationEngine(forceGraph);
    setupRightClickMenu(forceGraph);
    setupBubblePopEngine(forceGraph);
    setUpSequenceSearchEngine(forceGraph);
    setUpGeneAnnotationEngine(forceGraph);
    setUpPathHighlightEngine(forceGraph);
    setUpNodeSearchEngine(forceGraph);
}