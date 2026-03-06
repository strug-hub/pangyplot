// Entry point: init(), wire up modules.

import { state } from './simplify-state.js';
import { initSpine, setChromosome } from './data/spine.js';
import { resizeCanvas, fitToScreen } from './render/viewport.js';
import { fetchSkeletonData } from './skeleton/data/skeleton-fetcher.js';
import { placeGenes } from './render/annotation/gene-label-renderer.js';
import { navigateToHash, scheduleHashUpdate } from './engines/navigation/hash-navigation.js';
import { scheduleFrame } from './render-manager.js';
import { scheduleDetailFetch } from './force/engines/chain-pop-engine.js';
import { setupEngines } from './engines/engine-manager.js';
import { showLoadingError, showStats, initGridMeter } from './ui/status-bar.js';

async function init() {
    try {
        await fetchSkeletonData();
    } catch (err) {
        showLoadingError(err.message);
        return;
    }

    showStats();
    initGridMeter();

    // Initialize reference spine if available
    if (state.data.refSpine) {
        initSpine(state.data.refSpine);
        setChromosome(state.data.chromosome || '');
        placeGenes();
    }

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
