import eventBus from "../../../../utils/event-bus.js";

export default function setUpRecenterEngine(forceGraph) {

    eventBus.subscribe("graph:data-replaced", () => {
        setTimeout(() => {
            forceGraph.zoomToFit(200, 10, node => true);
        }, 500); // wait 0.5 seconds
    });

    forceGraph.element.addEventListener('keydown', (event) => {

        if (event.code === 'Space' || event.key === ' ') {
            forceGraph.zoomToFit(200, 10, node => true);
        }

        if (event.code === 'ArrowUp') {
            event.preventDefault();
            forceGraph.zoomToFit(200, 10, node => forceGraph.selected.has(node));
        }
    });
}
