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
        event: 'navigation:selection'
    },
    [InputModes.PAN_ZOOM]: {
        enableZoom: true,
        cursor: 'grabbing',
        event: 'navigation:pan-zoom'
    }
};

export default function setUpPanZoomEngine(forceGraph, graphElement) {
    forceGraph.enableZoomPanInteraction(false);

    const setMode = (mode) => {
        if (currentMode === mode) return;

        const { enableZoom, cursor, event } = modeConfig[mode];

        forceGraph.enableZoomPanInteraction(enableZoom);
        graphElement.style.cursor = cursor;

        eventBus.publish(event, enableZoom);
        currentMode = mode;

    };

    const handleKeyChange = (event) => {
        const newMode = event.shiftKey ? InputModes.PAN_ZOOM : InputModes.SELECTION;
        setMode(newMode);
    };

    graphElement.addEventListener('keydown', handleKeyChange);
    graphElement.addEventListener('keyup', handleKeyChange);
    graphElement.addEventListener('mousemove', handleKeyChange);

    graphElement.addEventListener('wheel', (event) => {
        if (!forceGraph) return;
        event.preventDefault();

    });
}
