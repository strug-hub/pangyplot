// Publish simplify canvas viewport bp range to the shared event bus.
// Keeps coordinate display, cytoband selection box, and genome overview in sync.
// Also triggers gene fetching on viewport change.

import eventBus from '../../utils/event-bus.js';
import { state } from '../simplify-state.js';
import { getViewport } from '../render/viewport.js';
import { xToBp, isReady } from '../engines/reference-spine-engine.js';
import { fetchAndPlaceGenes } from '../skeleton/data/gene-data.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';

let syncTimer = null;

export function publishViewportCoordinates() {
    if (!isReady() || !state.chromosome) return;
    const vp = getViewport();
    const bpLeft = xToBp(vp.minX);
    const bpRight = xToBp(vp.maxX);
    if (bpLeft === null || bpRight === null) return;
    const start = Math.max(0, Math.round(bpLeft));
    const end = Math.round(bpRight);
    eventBus.publish('ui:coordinates-changed', {
        chromosome: state.chromosome,
        start,
        end,
        source: 'simplify-viewport',
    });

    // Trigger gene fetch for visible range
    fetchAndPlaceGenes(state.chromosome, state.GENOME, start, end)
        .then(() => scheduleFrame());
}

export function scheduleViewportPublish() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(publishViewportCoordinates, 200);
}
