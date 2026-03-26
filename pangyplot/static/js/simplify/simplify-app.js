// Entry point: init(), wire up modules.

import { resizeCanvas, fitToScreen } from './render/viewport.js';
import { loadChromosome } from '@simplify-data/chromosome-loader.js';
import { navigateToHash, parseUrlHash, scheduleHashUpdate } from './engines/navigation/hash-navigation.js';
import { scheduleFrame } from './utils/frame-scheduler.js';
import './render-manager.js';
import { scheduleDetailFetch } from './engines/detail-transition-engine.js';
import { setupEngines } from './engines/engine-manager.js';
import { showLoadingError, showStats, initGridMeter } from './ui/status-bar.js';
import { state } from './simplify-state.js';
import { setupUiBridge } from './ui/ui-bridge.js';
import { setupPolychainForceSettings } from './ui/polychain-force-settings.js';
import { setupDebugScatterplot } from './ui/debug-scatterplot.js';
import { publishViewportCoordinates } from './ui/viewport-sync.js';

async function init() {
    // Determine initial chromosome from URL hash, fall back to chrY
    const hashParams = parseUrlHash();
    state.chromosome = (hashParams && hashParams.chrom) ? hashParams.chrom : 'chrY';

    try {
        await loadChromosome(state.chromosome);
    } catch (err) {
        showLoadingError(err.message);
        return;
    }

    showStats();
    initGridMeter();

    resizeCanvas();

    // Navigate to URL hash coordinates, or fit whole graph
    if (!navigateToHash()) {
        fitToScreen();
    }
    scheduleFrame();
    scheduleDetailFetch();
    scheduleHashUpdate();

    // Seed the shared UI (coordinate display + cytoband) with initial viewport
    publishViewportCoordinates();
}

setupUiBridge();
setupPolychainForceSettings();
setupDebugScatterplot();
setupEngines();
init();
