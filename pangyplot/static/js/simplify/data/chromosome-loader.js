// Fetch chromosome skeleton + polychain data and distribute to stores.

import { setLevelMeta, setChainMeta } from './chromosome-data.js';
import { initSkeleton } from '../skeleton/data/skeleton-init.js';
import { initSpine } from '../engines/reference-spine-engine.js';
import { state } from '../simplify-state.js';
import { initPolychainDataCache } from '../detail/data/polychain-data-cache.js';
import { clearBubbleMetaCache } from '../detail/data/bubble-meta-cache.js';

/** Decode delta-encoded polylines in-place. */
function decodeDelta(levels) {
    for (const level of levels) {
        for (const pl of level.polylines) {
            for (let i = 1; i < pl.length; i++) {
                pl[i][0] += pl[i - 1][0];
                pl[i][1] += pl[i - 1][1];
            }
        }
    }
}

export async function loadChromosome(chromosome) {
    // Fetch skeleton and polychain data in parallel
    const [skelResp, pdResp] = await Promise.all([
        fetch(`/skeleton?chromosome=${encodeURIComponent(chromosome)}`),
        fetch(`/polychain-data?chromosome=${encodeURIComponent(chromosome)}`),
    ]);

    if (!skelResp.ok) throw new Error(`HTTP ${skelResp.status}`);
    const raw = await skelResp.json();

    // Decode delta-encoded coordinates before anything reads them
    if (raw.meta?.encoding === 'delta') decodeDelta(raw.levels);

    // Polychain data (may be empty)
    if (pdResp.ok) {
        const pdRaw = await pdResp.json();
        initPolychainDataCache(pdRaw);
    }

    // Clear per-chain bubble metadata from previous chromosome
    clearBubbleMetaCache();

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
