import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import setUpHoverEngine from './hover/hover-engine.js';
import setUpSingleSelectEngine from './single-select-engine.js';
import { flipChainMode, clearSelected} from './selection-state.js';
import { generateSelectedInfo } from "./information/selected-information.js";
import eventBus from '../../../utils/event-bus.js';

var nodesDragged = false;
var selectionUpdated = false;

export default function setUpSelectionEngine(forceGraph, graphElement) {

    setUpHoverEngine(forceGraph, graphElement);

    setUpSingleSelectEngine(forceGraph, graphElement);
    setUpMultiSelectionEngine(forceGraph, graphElement);

    eventBus.subscribe('drag:node', () => {
        nodesDragged = true;
    });
    eventBus.subscribe('selection:changed', () => {
        selectionUpdated = true;
        generateSelectedInfo();
    });

    graphElement.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return; // Only left click
        nodesDragged = false;
        selectionUpdated = false;
    });

    graphElement.addEventListener('pointerup', (event) => {
        if (event.button !== 0) return; // Only left click
        setTimeout(() => {
            if (!nodesDragged && !selectionUpdated) {
                clearSelected();
            }
        }, 50);
    });

    graphElement.addEventListener('keydown', (event) => {
        if (event.key === 'c' || event.key === 'C') {
            event.preventDefault();
            flipChainMode();
        }
    });
}