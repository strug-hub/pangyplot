// Progressive detail: single-viewport fetch, response parsing.
// Pure data-fetching logic — no pop/unpop state machine.

import { state } from '../../simplify-state.js';
import { xToBp, getChromosome, isReady } from '../../data/spine.js';
import { getViewport } from '../../render/viewport.js';
import { scheduleFrame } from '../../render-manager.js';
import { selectLevel } from '../../render-manager.js';
import { setDetailPhase, scheduleFadeFrame } from '../../force/engines/chain-pop-engine.js';
import { showFetchIndicator, hideFetchIndicator } from '../../ui/status-bar.js';

let fetchController = null;
let fetchTimer = null;
let fadeStartTime = 0;

// Viewport layout bounds of the last successful fetch (with margin applied).
let fetchedRegion = null;

// ---------------------------------------------------------------
// Parse one API response into internal format
// ---------------------------------------------------------------
function processResponse(apiResponse) {
    const chains = [];
    let totalBubbles = 0;
    for (const chain of apiResponse.chains) {
        chains.push({
            id: chain.id,
            polyline: chain.polyline,
            length: chain.length,
            bpSpan: chain.bp_span || chain.length,
            nBubbles: chain.n_bubbles,
            subtype: chain.subtype,
            depth: chain.depth || 0,
            connector: chain.connector || false,
            bubbleIds: chain.bubble_ids || null,
            sourceSegs: chain.source_segs,
            sinkSegs: chain.sink_segs,
            bubblePositions: chain.bubble_positions || null,
            parentChain: chain.parent_chain || null,
            popped: !!chain.graph,
            graph: chain.graph || null,
        });
        totalBubbles += chain.n_bubbles;
    }
    return {
        chains, totalBubbles,
        bpStart: apiResponse.tile_start,
        bpEnd: apiResponse.tile_end,
        junctionNodes: apiResponse.junction_nodes || [],
        junctionLinks: apiResponse.junction_links || [],
        junctionGraph: apiResponse.junction_graph || { nodes: [], links: [] },
        junctionSegChains: apiResponse.junction_seg_chains || {},
        chainAdjacency: apiResponse.chain_adjacency || {},
        siblingConnectors: apiResponse.sibling_connectors || [],
    };
}

// ---------------------------------------------------------------
// Single-viewport fetch for current visible region
// ---------------------------------------------------------------
async function fetchDetailForViewport() {
    const chr = getChromosome();
    if (!isReady() || !chr) return;

    const vp = getViewport();
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const vpWidth = vp.maxX - vp.minX;
    if (vpWidth <= 0) return;

    const li = selectLevel();
    const gridSize = state.data.levels[li]?.gridSize || 50;
    const expandThreshold = Math.round(gridSize * 2);

    // --- Cache check (layout coords, no bp needed) ---
    if (fetchedRegion &&
        fetchedRegion.chr === chr &&
        fetchedRegion.expandThreshold === expandThreshold &&
        vp.minX >= fetchedRegion.minX &&
        vp.maxX <= fetchedRegion.maxX) {
        return;
    }

    // Margin: 30% of viewport width in layout units
    const margin = vpWidth * 0.3;
    const fetchMinX = vp.minX - margin;
    const fetchMaxX = vp.maxX + margin;

    // Convert layout bounds -> bp only for the API call
    const bpLeft = xToBp(fetchMinX);
    const bpRight = xToBp(fetchMaxX);
    if (bpLeft === null || bpRight === null) return;
    const ppbp = cw / (xToBp(vp.maxX) - xToBp(vp.minX));

    // Cancel any in-flight request
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();
    const signal = fetchController.signal;

    const url = `/detail-tiles?genome=${encodeURIComponent(state.GENOME)}`
        + `&chromosome=${encodeURIComponent(chr)}`
        + `&start=${Math.max(0, Math.round(bpLeft))}&end=${Math.round(bpRight)}`
        + `&ppbp=${ppbp}&expand=${expandThreshold}`
        + `&layout_min_x=${fetchMinX.toFixed(1)}&layout_max_x=${fetchMaxX.toFixed(1)}`;

    showFetchIndicator();
    try {
        const resp = await fetch(url, { signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const apiData = await resp.json();
        if (signal.aborted) return;

        fetchedRegion = { minX: fetchMinX, maxX: fetchMaxX, chr, expandThreshold };
        state.detailData = processResponse(apiData);

        if (state.detailPhase === 'none') {
            fadeStartTime = performance.now();
            setDetailPhase('fading-in');
            scheduleFadeFrame();
        } else if (state.detailPhase === 'fading-out') {
            const remaining = state.detailOpacity;
            fadeStartTime = performance.now() - remaining * state.FADE_DURATION;
            setDetailPhase('fading-in');
            scheduleFadeFrame();
        }

        scheduleFrame();
    } catch (e) {
        if (e.name !== 'AbortError') console.warn('Detail fetch failed:', e);
    } finally {
        hideFetchIndicator();
    }
}

// ---------------------------------------------------------------
// Public: clear fetch state
// ---------------------------------------------------------------
export function clearFetchedRegion() {
    fetchedRegion = null;
}

export function getFadeStartTime() { return fadeStartTime; }
export function setFadeStartTime(t) { fadeStartTime = t; }

// ---------------------------------------------------------------
// Public: debounced detail fetch trigger (re-exported from chain-pop-engine)
// ---------------------------------------------------------------
export function doScheduleDetailFetch() {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
        selectLevel();
        if (state.targetGridSize > state.DETAIL_GRID_THRESHOLD) {
            state.detailSuppressed = false;
            // Import dynamically to avoid circular reference at module load time
            import('../../force/engines/chain-pop-engine.js').then(m => m.exitDetailMode());
        } else if (state.detailSuppressed) {
            import('../../force/engines/chain-pop-engine.js').then(m => m.exitDetailMode());
        } else {
            fetchDetailForViewport();
        }
    }, 200);
}
