import eventBus from '../../../../utils/event-bus.js';

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
            if (forceGraph.isPanZoomMode()) return;
            if (forceGraph.isDragging()) return;
            if (selectionUpdated) return;
            
            forceGraph.setSelected(null);
        }, 50);
    });

}