import eventBus from '@event-bus';
import appState from "../../app-state.js";

export default function setUpModesEngine(forceGraph) {

    function updateMode(event) {
        let targetMode = appState.modes.find(m => m.keyCheck(event));

        if (!targetMode) {
            targetMode = appState.defaultMode;
        }

        if (appState.mode !== targetMode.mode) {
            appState.mode = targetMode.mode;
            forceGraph.element.style.setProperty('--graph-cursor', targetMode.cursor);
            eventBus.publish("graph:mode-changed", targetMode.mode);
        }
    }

    forceGraph.element.addEventListener('keydown', updateMode);
    forceGraph.element.addEventListener('mousemove', updateMode);
    forceGraph.element.addEventListener('keyup', updateMode);

}
