import eventBus from "../../../../utils/event-bus.js";

export default function setUpPanZoomEngine(forceGraph) {
    forceGraph.enableZoomPanInteraction(false);

    const panZoomMode = {
        mode: "pan-zoom",
        keyCheck: e => e.shiftKey,
        cursor: "grabbing",
    };

    forceGraph.registerMode(panZoomMode);

    eventBus.subscribe("graph:mode-changed", (mode) => {
        if (mode === panZoomMode.mode) {
            forceGraph.enableZoomPanInteraction(true);
        } else {
            forceGraph.enableZoomPanInteraction(false);
        }
    });
}
