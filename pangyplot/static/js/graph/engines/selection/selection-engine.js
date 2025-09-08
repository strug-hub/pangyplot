import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import setUpHoverEngine from './hover/hover-engine.js';
import setUpSingleSelectEngine from './single-selection/single-selection-engine.js';
import { flipChainMode, clearSelected} from './selection-state.js';
import { generateSelectedInfo } from "./information/selected-information.js";
import eventBus from '../../../utils/event-bus.js';

var selectionUpdated = false;

export default function setUpSelectionEngine(forceGraph) {

    setUpHoverEngine(forceGraph);

    setUpSingleSelectEngine(forceGraph);
    setUpMultiSelectionEngine(forceGraph);


    eventBus.subscribe('graph:selected-changed', () => {
        selectionUpdated = true;
        generateSelectedInfo();
    });

    forceGraph.element.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return; // Only left click
        selectionUpdated = false;
    });

    forceGraph.element.addEventListener('pointerup', (event) => {
        if (event.button !== 0) return; // Only left click
        setTimeout(() => {
            if (!forceGraph.isDragging() && !selectionUpdated) {
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