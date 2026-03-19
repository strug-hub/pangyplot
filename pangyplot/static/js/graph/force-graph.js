import eventBus from '@event-bus';
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
export function initCoreViewer(containerEl, coords) {
    const fg = ForceGraph()(containerEl);

    const canvas = containerEl.querySelector('canvas');

    fg.element = containerEl;
    fg.canvas = canvas;

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
const isStandalonePage = !!window.__CORE_CONFIG;
if (isStandalonePage) {
    document.addEventListener("DOMContentLoaded", function () {
        const standaloneEl = document.getElementById("graph");
        const cfg = window.__CORE_CONFIG || {};
        let coords;
        if (cfg.chromosome && cfg.start && cfg.end) {
            coords = {
                genome: cfg.genome,
                chromosome: cfg.chromosome,
                start: parseInt(cfg.start, 10),
                end: parseInt(cfg.end, 10),
            };
        } else {
            coords = {genome: "GRCh38", chromosome:"chrY", start:23129355, end:23199010};
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
