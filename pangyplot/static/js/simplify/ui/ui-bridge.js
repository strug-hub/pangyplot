// Bridge between shared UI controls (coordinates, cytoband, gene search) and
// the simplify canvas. Subscribes to event-bus events and drives canvas
// navigation / chromosome loading.

import eventBus from '@event-bus';
import { state } from '../simplify-state.js';
import { loadChromosome } from '../data/chromosome-loader.js';
import { navigateToRegion } from '../engines/navigation/hash-navigation.js';
import { resizeCanvas, fitToScreen, getViewport } from '../render/viewport.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { scheduleDetailFetch } from '../engines/detail-transition-engine.js';
import { scheduleHashUpdate } from '../engines/navigation/hash-navigation.js';
import { clearGeneCache } from '../skeleton/data/gene-data.js';
import { clearLabelAnimation } from '../skeleton/render/skeleton-gene-overlay.js';
import { showLoadingError, showStats, initGridMeter } from './status-bar.js';
import { publishViewportCoordinates } from './viewport-sync.js';

function handleConstructGraph(data) {
    const chrom = data.chromosome;
    const start = data.start != null ? parseInt(data.start, 10) : null;
    const end = data.end != null ? parseInt(data.end, 10) : null;

    if (chrom && chrom !== state.chromosome) {
        switchChromosome(chrom, start, end);
    } else if (start != null && end != null) {
        navigateToRegion(start, end);
        scheduleFrame();
        scheduleDetailFetch();
        scheduleHashUpdate();
        publishViewportCoordinates();
    }
}

async function switchChromosome(chrom, start, end) {
    const prev = state.chromosome;
    state.chromosome = chrom;
    clearGeneCache();
    clearLabelAnimation();
    try {
        await loadChromosome(chrom);
    } catch (err) {
        state.chromosome = prev;
        showLoadingError(`Could not load ${chrom}: ${err.message}`);
        return;
    }

    showStats();
    initGridMeter();
    resizeCanvas();

    if (start != null && end != null) {
        navigateToRegion(start, end);
    } else {
        fitToScreen();
    }
    scheduleFrame();
    scheduleDetailFetch();
    scheduleHashUpdate();
    publishViewportCoordinates();

    // Genes are loaded by loadChromosome — just schedule a frame
    scheduleFrame();
}

export function setupUiBridge() {
    eventBus.subscribe('ui:construct-graph', handleConstructGraph);
}
