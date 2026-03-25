import eventBus from '@event-bus';
import { getGenome, getChromosome, getStart, getEnd } from '@app-state';
import appState from './app-state.js';
import setUpEngineManager from './engines/engine-manager.js';
import setUpForceManager from './forces/force-manager.js';
import { setUpRenderManager } from './render/render-manager.js';
import setUpUiManager from './ui/ui-manager.js';
import { setUpDataManager} from './data/data-manager.js';
import recordsManager from './data/records/records-manager.js';
import viewState from './data/view-state.js';
import { nodeRecordLookup, linkRecordLookup, nodeAdjacencyLookup, geneRecordLookup } from './data/records/records-manager-implementation.js';

let forceGraph = null;

/**
 * Initialize the core force-graph viewer inside a container element.
 * Can be called from the standalone page or embedded in the simplify viewer.
 * Returns the forceGraph instance.
 */
export function destroyCoreViewer(fg) {
    if (!fg) return;

    // Stop animation loop and clear graph data (ForceGraph built-in)
    if (fg._destructor) fg._destructor();

    // Run all registered cleanup functions (global event listeners, etc.)
    if (fg._cleanups) {
        fg._cleanups.forEach(fn => fn());
        fg._cleanups.length = 0;
    }

    // Restore eventBus to the state before core viewer engines subscribed
    if (fg._eventBusSnapshot) {
        eventBus.events = fg._eventBusSnapshot;
    }
}

export function initCoreViewer(containerEl, coords) {
    const fg = ForceGraph()(containerEl);

    const canvas = containerEl.querySelector('canvas');

    fg.element = containerEl;
    fg.canvas = canvas;
    fg._cleanups = [];

    // Snapshot eventBus so we can restore it when this viewer is destroyed
    fg._eventBusSnapshot = Object.fromEntries(
        Object.entries(eventBus.events).map(([k, v]) => [k, [...v]])
    );

    // Ensure the container can receive keyboard events
    if (!containerEl.hasAttribute('tabindex')) {
        containerEl.setAttribute('tabindex', '0');
    }
    containerEl.addEventListener('click', () => containerEl.focus());

    canvas.ctx = canvas.getContext('2d');
    fg.getZoomFactor = function () {
        return this.canvas.__zoom["k"];
    }

    fg.graphData({nodes: [], links: []})
        .nodeId("iid")
        .enablePointerInteraction(false)
        .autoPauseRedraw(false)
        .cooldownTicks(Infinity)
        .cooldownTime(Infinity)
        .warmupTicks(4)

    setUpEngineManager(fg);
    setUpRenderManager(fg);
    setUpForceManager(fg);
    setUpDataManager(fg);
    setUpUiManager(fg);

    if (coords) {
        eventBus.publish("ui:construct-graph", coords);
    }

    return fg;
}

// Standalone page initialization (only on the core viewer page, not when embedded)
const isStandalonePage = !!window.__APP_CONFIG;
if (isStandalonePage) {
    document.addEventListener("DOMContentLoaded", function () {
        const standaloneEl = document.getElementById("graph");
        const chromosome = getChromosome();
        const start = getStart();
        const end = getEnd();
        let coords = null;

        if (chromosome && start && end) {
            coords = {
                genome: getGenome(),
                chromosome,
                start: parseInt(start, 10),
                end: parseInt(end, 10),
            };
        }

        forceGraph = initCoreViewer(standaloneEl, coords);
        standaloneEl.classList.add("hidden");

        window._forceGraph = forceGraph;
        window._appState = appState;
        window._eventBus = eventBus;
        window._recordsManager = recordsManager;
        window._viewState = viewState;
        window._lookups = { nodeRecordLookup, linkRecordLookup, nodeAdjacencyLookup, geneRecordLookup };
    });
}

export default forceGraph;
