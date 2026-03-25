// Publish simplify canvas viewport bp range to the shared event bus.
// Keeps coordinate display, cytoband selection box, and genome overview in sync.
// Also triggers gene fetching on viewport change.

import eventBus from '@event-bus';
import { state } from '../simplify-state.js';
import { getViewport } from '../render/viewport.js';
import { layoutToBp, isReady } from '../engines/reference-spine-engine.js';

let syncTimer = null;

export function publishViewportCoordinates() {
    if (!isReady() || !state.chromosome) return;
    const vp = getViewport();
    const midY = (vp.minY + vp.maxY) / 2;
    const bpLeft = layoutToBp(vp.minX, midY);
    const bpRight = layoutToBp(vp.maxX, midY);
    if (bpLeft === null || bpRight === null) return;
    const start = Math.max(0, Math.round(bpLeft));
    const end = Math.round(bpRight);
    eventBus.publish('ui:coordinates-changed', {
        chromosome: state.chromosome,
        start,
        end,
        source: 'simplify-viewport',
    });
}

export function scheduleViewportPublish() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(publishViewportCoordinates, 200);
}
