import eventBus from "../../../utils/event-bus.js";

function toCamelCase(name) {
    return name
        .split(/[-_\s]/) // split on dash/underscore/space
        .map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
}

export default function setUpModesEngine(forceGraph) {

    forceGraph.modes = [];
    forceGraph.mode = "selection";

    forceGraph.registerMode = function (modeData) {
        this.modes.push(modeData);

        // is____Mode() function added to forceGraph
        const fnName = `is${toCamelCase(modeData.mode)}Mode`;
        this[fnName] = function () {
            return this.mode === modeData.mode;
        };
    };

    forceGraph.defaultMode = {
        mode: "selection",
        keyCheck: null,
        cursor: "default",
    };

    forceGraph.isSelectionMode = function () {
        return this.mode === "selection";
    };

    function updateMode(event) {
        let targetMode = forceGraph.modes.find(m => m.keyCheck(event));

        if (!targetMode) {
            targetMode = forceGraph.defaultMode;
        }

        if (forceGraph.mode !== targetMode.mode) {
            forceGraph.mode = targetMode.mode;
            forceGraph.element.style.cursor = targetMode.cursor;
            eventBus.publish("graph:mode-changed", targetMode.mode);
        }
    }

    forceGraph.element.addEventListener('keydown', updateMode);
    forceGraph.element.addEventListener('mousemove', updateMode);
    forceGraph.element.addEventListener('keyup', updateMode);

}