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

export default function setUpPanZoomEngine(forceGraph, canvasElement) {
    forceGraph.enableZoomPanInteraction(false);

    const setMode = (mode) => {
        if (currentMode === mode) return;

        const { enableZoom, cursor, event } = modeConfig[mode];

        forceGraph.enableZoomPanInteraction(enableZoom);
        canvasElement.style.cursor = cursor;

        eventBus.publish(event, enableZoom);
        currentMode = mode;

    };

    const handleKeyChange = (event) => {
        const newMode = event.shiftKey ? InputModes.PAN_ZOOM : InputModes.SELECTION;
        setMode(newMode);
    };

    canvasElement.addEventListener('keydown', handleKeyChange);
    canvasElement.addEventListener('keyup', handleKeyChange);
    canvasElement.addEventListener('mousemove', handleKeyChange);

    canvasElement.addEventListener('wheel', (event) => {
        if (!forceGraph) return;
        event.preventDefault();

    });
}
