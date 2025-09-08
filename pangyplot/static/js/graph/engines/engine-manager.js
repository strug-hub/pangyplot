import setUpDragEngine from './drag/drag-engine.js';
import setUpNavigationEngine from './navigation/navigation-engine.js';
import setUpSelectionEngine from './selection/selection-engine.js';
import setupRightClickMenu from './right-click/right-click-engine.js';
import setupBubblePopEngine from './bubble-pop/bubble-pop-engine.js';
import setUpSequenceSearchEngine from './sequence-search/sequence-search-engine.js';
import setUpGeneAnnotationEngine from './gene-annotation/gene-annotation-engine.js';
import setUpPathHighlightEngine from './path-highlight/path-highlight-engine.js';

export default function setUpEngineManager(forceGraph) {
    setUpDragEngine(forceGraph);
    setUpSelectionEngine(forceGraph);
    setUpNavigationEngine(forceGraph);
    setupRightClickMenu(forceGraph);
    setupBubblePopEngine(forceGraph);
    setUpSequenceSearchEngine(forceGraph);
    setUpGeneAnnotationEngine(forceGraph);
    setUpPathHighlightEngine(forceGraph);
}