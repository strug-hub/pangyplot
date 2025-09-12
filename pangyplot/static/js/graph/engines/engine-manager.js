import setUpModesEngine from './modes/modes-engine.js';
import setUpDragEngine from './drag/drag-engine.js';
import setUpNavigationEngine from './navigation/navigation-engine.js';
import setUpSelectionEngine from './selection/selection-engine.js';
import setupRightClickMenu from './right-click/right-click-engine.js';
import setupBubblePopEngine from './bubble-pop/bubble-pop-engine.js';
import setUpSequenceSearchEngine from './sequence-search/sequence-search-engine.js';
import setUpGeneAnnotationEngine from './gene-annotation/gene-annotation-engine.js';
import setUpPathHighlightEngine from './path-highlight/path-highlight-engine.js';
import setUpAnchorEndsEngine from './anchor-ends/anchor-ends-engine.js';
import setUpInformationEngine from './information/information-engine.js';
import setUpReheatEngine from './reheat/reheat-engine.js';
import { debugStatusUpdate } from './information/debug/debug-information-engine.js';
import { pathHighlightTick } from './path-highlight/animation/animation-tick.js';
import { updateNodeHighlight } from './path-highlight/animation/animation-tick.js';

export default function setUpEngineManager(forceGraph) {

    //todo put somewhere?
    forceGraph.element.addEventListener('wheel', (event) => {
        event.preventDefault();
    });

    setUpModesEngine(forceGraph);
    setUpNavigationEngine(forceGraph);
    setUpSelectionEngine(forceGraph);
    setUpDragEngine(forceGraph);
    setupBubblePopEngine(forceGraph);
    setupRightClickMenu(forceGraph);
    setUpSequenceSearchEngine(forceGraph);
    setUpGeneAnnotationEngine(forceGraph);
    setUpPathHighlightEngine(forceGraph);
    setUpAnchorEndsEngine(forceGraph);
    setUpInformationEngine(forceGraph);
    setUpReheatEngine(forceGraph);

    forceGraph.onEngineTick(() => {
        //todo: create abstract system for adding ticks, sent to each engine above.
        debugStatusUpdate(forceGraph);
        pathHighlightTick(forceGraph);
        // todo: searchSequenceEngineRerun();
        updateNodeHighlight();
    });
}

