import eventBus from '../../../../utils/event-bus.js';
import appState from '../../../app-state.js';

var selectionUpdated = false;

export default function setUpCancelSelectionEngine(forceGraph){

    forceGraph.element.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        selectionUpdated = false;
    });

    eventBus.subscribe('graph:selection-changed', () => {
        selectionUpdated = true;
    });

    forceGraph.element.addEventListener('pointerup', (event) => {
        if (event.button !== 0) return;
        setTimeout(() => {
            if (appState.isDragging()) return;
            if (selectionUpdated) return;

            appState.setSelected(null);
        }, 50);
    });

}