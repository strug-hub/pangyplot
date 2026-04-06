// Scroll-wheel influence radius control during drag.
// Registers the drag influence force into the D3 simulation.

import { state } from '../../state.js';
import { registerCustomForce } from '../../detail/engines/force-engine.js';
import { dragInfluenceForce, getInfluence, setInfluence, invalidateCache } from './drag-influence-force.js';

export function setupDragInfluenceEngine() {
    registerCustomForce('dragInfluence', dragInfluenceForce());

    document.addEventListener('wheel', e => {
        if (!state.dragMode) return;
        const cur = getInfluence();
        const next = e.deltaY > 0
            ? Math.max(cur - 0.025, 0.01)
            : Math.min(cur + 0.025, 1);
        setInfluence(next);
        invalidateCache();
    });
}
