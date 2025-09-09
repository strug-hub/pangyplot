import setUpPanZoomEngine from './pan-zoom/pan-zoom-engine.js';
import setUpNodeSearchEngine from './node-search/node-search-engine.js';
import setUpRotationEngine from './rotation/rotation-engine.js';
import setUpRecenterEngine from './recenter/recenter-engine.js';


export default function setUpNavigationEngine(forceGraph) {
    setUpPanZoomEngine(forceGraph);
    setUpRecenterEngine(forceGraph);
    setUpRotationEngine(forceGraph);
    setUpNodeSearchEngine(forceGraph);
}
