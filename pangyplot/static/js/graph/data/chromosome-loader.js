// Fetch chromosome skeleton + polychain data and distribute to stores.

import { setLevelMeta, setChainMeta } from './chromosome-data.js';
import { initSkeleton } from '../skeleton/data/skeleton-init.js';
import { initSpine } from '../engines/reference-spine-engine.js';
import { initGeneCache } from './gene-data.js';
import { state } from '../state.js';
import { initPolychainDataCache } from '../detail/data/polychain-data-cache.js';
import { clearBubbleMetaCache } from '../detail/data/bubble-meta-cache.js';
import { pcSettings, REFERENCE_LINK_DISTANCE } from '../detail/engines/forces/pc-settings.js';
import { syncScaleSlider } from '../ui/polychain-force-settings.js';

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
    // Fetch skeleton, spine, polychain, and genes in parallel
    const chr = encodeURIComponent(chromosome);
    const genome = encodeURIComponent(state.GENOME);
    const [skelResp, spineResp, pdResp, geneResp, metaResp] = await Promise.all([
        fetch(`/skeleton?chromosome=${chr}`),
        fetch(`/spine?chromosome=${chr}`),
        fetch(`/polychain-data?chromosome=${chr}`),
        fetch(`/genes?genome=${genome}&chromosome=${chr}&mane_only=true`),
        fetch(`/graph-meta?chromosome=${chr}`),
    ]);

    if (!skelResp.ok) throw new Error(`HTTP ${skelResp.status}`);
    const raw = await skelResp.json();

    // Decode delta-encoded coordinates before anything reads them
    if (raw.meta?.encoding === 'delta') decodeDelta(raw.levels);

    // Spine (shared coordinate infrastructure)
    if (spineResp.ok) {
        const spineData = await spineResp.json();
        if (spineData.spine) initSpine(spineData.spine);
    }

    // Polychain data (may be empty)
    if (pdResp.ok) {
        const pdRaw = await pdResp.json();
        initPolychainDataCache(pdRaw);
    }

    // Graph metadata (force scaling)
    if (metaResp.ok) {
        const meta = await metaResp.json();
        if (meta.median_link_distance) {
            pcSettings.dataScale = meta.median_link_distance / REFERENCE_LINK_DISTANCE;
        }
        state.graphMeta = meta;
    } else {
        pcSettings.dataScale = 1;
        state.graphMeta = null;
    }
    syncScaleSlider();

    // Genes (fetched for entire chromosome; MANE Select first, fallback to all)
    let genes = [];
    if (geneResp.ok) {
        const geneData = await geneResp.json();
        genes = geneData.genes || [];
    }
    if (genes.length === 0) {
        // Fallback: fetch all genes without MANE filter
        const fallbackResp = await fetch(`/genes?genome=${genome}&chromosome=${chr}`);
        if (fallbackResp.ok) {
            const fallbackData = await fallbackResp.json();
            genes = fallbackData.genes || [];
        }
    }
    initGeneCache(genes);

    // Clear per-chain bubble metadata from previous chromosome
    clearBubbleMetaCache();

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
