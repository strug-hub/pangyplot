import eventBus from '@event-bus';
import appState from "../../../app-state.js";

export function isPanning() { return _panning; }
let _panning = false;

export default function setUpPanZoomEngine(forceGraph) {
    // Pan-zoom is the default mode; disable when another mode is active
    forceGraph.enableZoomPanInteraction(true);

    eventBus.subscribe("graph:mode-changed", (mode) => {
        forceGraph.enableZoomPanInteraction(mode === "pan-zoom");
    });

    // Show grabbing cursor once panning commits (mouse moves after mousedown)
    const el = forceGraph.element;
    const MIN_PAN_PX = 5;
    let panStart = null;

    el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !appState.isPanZoomMode()) return;
        panStart = { x: e.clientX, y: e.clientY };
        _panning = false;
    }, true);
    el.addEventListener('pointermove', e => {
        if (!panStart || _panning) return;
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        if (dx * dx + dy * dy > MIN_PAN_PX * MIN_PAN_PX) {
            _panning = true;
            el.style.setProperty('--graph-cursor', 'grabbing');
        }
    }, true);
    const restoreCursor = () => {
        panStart = null;
        if (_panning) {
            _panning = false;
            if (appState.isPanZoomMode()) {
                el.style.setProperty('--graph-cursor', appState.hoveredNode ? 'default' : 'grab');
            }
        }
    };
    el.addEventListener('pointerup', restoreCursor, true);
    window.addEventListener('pointerup', restoreCursor);
}
