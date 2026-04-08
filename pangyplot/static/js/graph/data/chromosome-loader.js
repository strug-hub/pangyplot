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

/**
 * Index the binary buffer — compute byte offsets per level without
 * reconstructing any polylines. Returns the raw slices for lazy decoding.
 */
function indexBinaryLevels(buffer, levels) {
    let offset = 0;
    for (const level of levels) {
        const numPl = level.numPolylines;
        const totalPts = level.totalPoints;

        level._binPointCounts = new Uint32Array(buffer, offset, numPl);
        offset += numPl * 4;
        level._binChainIds = new Int32Array(buffer, offset, numPl);
        offset += numPl * 4;
        level._binCoords = new Int32Array(buffer, offset, totalPts * 2);
        offset += totalPts * 2 * 4;

        level._decoded = false;
    }
}


export async function loadChromosome(chromosome) {
    const t0 = performance.now();

    // Fetch skeleton, spine, polychain, and genes in parallel
    const chr = encodeURIComponent(chromosome);
    const genome = encodeURIComponent(state.GENOME);
    const [skelMetaResp, skelBinResp, spineResp, pdResp, geneResp, metaResp] = await Promise.all([
        fetch(`/skeleton?chromosome=${chr}`),
        fetch(`/skeleton-bin?chromosome=${chr}`),
        fetch(`/spine?chromosome=${chr}`),
        fetch(`/polychain-data?chromosome=${chr}`),
        fetch(`/genes?genome=${genome}&chromosome=${chr}&mane_only=true`),
        fetch(`/graph-meta?chromosome=${chr}`),
    ]);

    const tFetch = performance.now();
    console.log(`[load] fetch: ${(tFetch - t0).toFixed(0)}ms`);

    if (!skelMetaResp.ok || !skelBinResp.ok) {
        throw new Error(`No data for ${decodeURIComponent(chr)}. This chromosome may not be in the dataset.`);
    }

    let t1 = performance.now();
    const raw = await skelMetaResp.json();
    console.log(`[load]   meta json: ${(performance.now() - t1).toFixed(0)}ms`);

    t1 = performance.now();
    const binBuffer = await skelBinResp.arrayBuffer();
    console.log(`[load]   bin arraybuffer: ${(performance.now() - t1).toFixed(0)}ms`);

    t1 = performance.now();
    indexBinaryLevels(binBuffer, raw.levels);
    console.log(`[load]   index levels: ${(performance.now() - t1).toFixed(0)}ms`);

    const tSkelParse = performance.now();
    console.log(`[load] skeleton parse: ${(tSkelParse - tFetch).toFixed(0)}ms`);

    // Spine (shared coordinate infrastructure)
    t1 = performance.now();
    if (spineResp.ok) {
        const spineData = await spineResp.json();
        if (spineData.spine) initSpine(spineData.spine);
    }
    console.log(`[load]   spine: ${(performance.now() - t1).toFixed(0)}ms`);

    // Polychain data (may be empty)
    t1 = performance.now();
    if (pdResp.ok) {
        const pdRaw = await pdResp.json();
        initPolychainDataCache(pdRaw);
    }
    console.log(`[load]   polychain: ${(performance.now() - t1).toFixed(0)}ms`);

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
    const tGene0 = performance.now();
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

    const tGene1 = performance.now();
    console.log(`[load] genes: ${(tGene1 - tGene0).toFixed(0)}ms (${genes.length} genes)`);

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

    const tInit = performance.now();
    console.log(`[load] skeleton init: ${(tInit - tGene1).toFixed(0)}ms`);
    console.log(`[load] total: ${(tInit - t0).toFixed(0)}ms`);

    // App stats
    state.stats = raw.stats;
}
