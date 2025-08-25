import setUpMultiSelectionEngine from './multi-selection/multi-selection-engine.js';
import setUpHoverEngine from './hover-engine.js';
import setUpSingleSelectEngine from './single-select-engine.js';
import { flipBubbleMode, clearSelected} from './selection-state.js';
import eventBus from '../../../utils/event-bus.js';

var nodesDragged = false;
var selectionUpdated = false;

function switchBubbleMode(event) {
    if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        flipBubbleMode();
    }
}

export default function setUpSelectionEngine(forceGraph, canvasElement) {

    setUpHoverEngine(forceGraph, canvasElement);

    setUpSingleSelectEngine(forceGraph, canvasElement);
    setUpMultiSelectionEngine(forceGraph, canvasElement);

    eventBus.subscribe('drag:node', () => {
        nodesDragged = true;
    });
    eventBus.subscribe('selection:changed', () => {
        selectionUpdated = true;
    });

    canvasElement.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return; // Only left click
        nodesDragged = false;
        selectionUpdated = false;
    });

    canvasElement.addEventListener('pointerup', (event) => {
        if (event.button !== 0) return; // Only left click
        setTimeout(() => {
            if (!nodesDragged && !selectionUpdated) {
                clearSelected();
            }
        }, 50);
    });

    canvasElement.addEventListener('keydown', (event) => {
        switchBubbleMode(event);
    });

}