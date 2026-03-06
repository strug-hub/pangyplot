// Entry point: init(), wire up modules.

import { resizeCanvas, fitToScreen } from './render/viewport.js';
import { loadChromosome } from './data/chromosome-loader.js';
import { placeGenes } from './skeleton/data/gene-data.js';
import { navigateToHash, scheduleHashUpdate } from './engines/navigation/hash-navigation.js';
import { scheduleFrame } from './utils/frame-scheduler.js';
import './render-manager.js';
import { scheduleDetailFetch } from './engines/detail-transition-engine.js';
import { setupEngines } from './engines/engine-manager.js';
import { showLoadingError, showStats, initGridMeter } from './ui/status-bar.js';
import { isReady } from './engines/reference-spine-engine.js';
import { state } from './simplify-state.js';

async function init() {
    state.chromosome = 'chrY';
    try {
        await loadChromosome(state.chromosome);
    } catch (err) {
        showLoadingError(err.message);
        return;
    }

    showStats();
    initGridMeter();
    if (isReady()) placeGenes();

    resizeCanvas();

    // Navigate to URL hash coordinates, or fit whole graph
    if (!navigateToHash()) {
        fitToScreen();
    }
    scheduleFrame();
    scheduleDetailFetch();
    scheduleHashUpdate();
}

setupEngines();
init();
