import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import setUpHoverEngine from './hover/hover-engine.js';
import setUpSingleSelectEngine from './single-selection/single-selection-engine.js';
import { flipChainMode, clearSelected} from './selection-state.js';
import { generateSelectedInfo } from "./information/selected-information.js";
import eventBus from '../../../utils/event-bus.js';

var nodesDragged = false;
var selectionUpdated = false;

export default function setUpSelectionEngine(forceGraph) {

    setUpHoverEngine(forceGraph);

    setUpSingleSelectEngine(forceGraph);
    setUpMultiSelectionEngine(forceGraph);

    eventBus.subscribe('drag:node', () => {
        nodesDragged = true;
    });
    eventBus.subscribe('selection:changed', () => {
        selectionUpdated = true;
        generateSelectedInfo();
    });

    forceGraph.element.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return; // Only left click
        nodesDragged = false;
        selectionUpdated = false;
    });

    forceGraph.element.addEventListener('pointerup', (event) => {
        if (event.button !== 0) return; // Only left click
        setTimeout(() => {
            if (!nodesDragged && !selectionUpdated) {
                clearSelected();
            }
        }, 50);
    });

    forceGraph.element.addEventListener('keydown', (event) => {
        if (event.key === 'c' || event.key === 'C') {
            event.preventDefault();
            flipChainMode();
        }
    });
}