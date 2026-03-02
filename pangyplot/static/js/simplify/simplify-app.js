// Entry point: init(), wire up modules.

import { state } from './simplify-state.js';
import { initSpine, setChromosome } from './spine.js';
import { precomputeBboxes, computeBounds, resizeCanvas, fitToScreen } from './viewport.js';
import { placeGenes } from './genes.js';
import { navigateToHash, scheduleHashUpdate } from './hash-navigation.js';
import { scheduleFrame } from './render.js';
import { scheduleDetailFetch } from './detail.js';
import { setupInteraction } from './interaction.js';

async function init() {
    try {
        const resp = await fetch('/simplify-data');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        state.data = await resp.json();
    } catch (err) {
        state.dom.loading.textContent = `Error loading data: ${err.message}`;
        return;
    }

    state.dom.loading.style.display = 'none';

    state.dom.stats.textContent =
        `${state.data.stats.totalSegments.toLocaleString()} segs | ` +
        `${state.data.stats.junctionCount.toLocaleString()} junctions | ` +
        `${state.data.levels.length} grid levels`;

    precomputeBboxes();
    computeBounds();

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

setupInteraction();
init();
