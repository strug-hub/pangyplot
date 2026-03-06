// Fetch chromosome skeleton data and distribute to stores.

import { setLevelMeta, setChainMeta } from './chromosome-data.js';
import { initSkeleton } from '../skeleton/data/skeleton-init.js';
import { initSpine } from '../engines/reference-spine-engine.js';
import { state } from '../simplify-state.js';

export async function loadChromosome(chromosome) {
    const resp = await fetch(`/skeleton?chromosome=${encodeURIComponent(chromosome)}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();

    // Spine (shared coordinate infrastructure)
    if (raw.refSpine) initSpine(raw.refSpine);

    // LOD metadata (shared)
    setLevelMeta(raw.levels.map(l => ({
        gridSize: l.gridSize, label: l.label,
        nodeCount: l.nodeCount, polylineCount: l.polylineCount,
    })));

    // Chain metadata (shared — used by skeleton hover + detail hover)
    setChainMeta(raw.chainMeta || null);

    // Skeleton rendering data (skeleton-internal)
    initSkeleton(raw.levels, raw.chainMeta);

    // App stats
    state.stats = raw.stats;
}
