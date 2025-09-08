import eventBus from '../../../utils/event-bus.js';

const InputModes = Object.freeze({
    SELECTION: 'selection',
    PAN_ZOOM: 'pan-zoom',
});

let currentMode = InputModes.SELECTION;

export function isPanZoomMode() {
    return currentMode === InputModes.PAN_ZOOM;
}

const modeConfig = {
    [InputModes.SELECTION]: {
        enableZoom: false,
        cursor: 'default',
        event: 'navigation:selection-mode'
    },
    [InputModes.PAN_ZOOM]: {
        enableZoom: true,
        cursor: 'grabbing',
        event: 'navigation:pan-zoom-mode'
    }
};

export default function setUpPanZoomEngine(forceGraph) {
    forceGraph.enableZoomPanInteraction(false);

    const setMode = (mode) => {
        if (currentMode === mode) return;

        const { enableZoom, cursor, event } = modeConfig[mode];

        forceGraph.enableZoomPanInteraction(enableZoom);
        forceGraph.element.style.cursor = cursor;

        eventBus.publish(event, enableZoom);
        currentMode = mode;

    };

    const handleKeyChange = (event) => {
        const newMode = event.shiftKey ? InputModes.PAN_ZOOM : InputModes.SELECTION;
        setMode(newMode);
    };

    forceGraph.element.addEventListener('keydown', handleKeyChange);
    forceGraph.element.addEventListener('keyup', handleKeyChange);
    forceGraph.element.addEventListener('mousemove', handleKeyChange);

    forceGraph.element.addEventListener('wheel', (event) => {
        event.preventDefault();
    });
}
