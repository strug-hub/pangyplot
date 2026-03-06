// Progressive detail: single-viewport fetch, response parsing.
// Pure data-fetching — no skeleton imports, no UI imports, no fade or LOD decisions.

import { state } from '../../../simplify-state.js';

let fetchController = null;

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
// Single-viewport fetch for current visible region.
// Caller provides pre-computed viewport and coordinate info.
// Returns true if new data was fetched, false otherwise.
// ---------------------------------------------------------------
export async function fetchDetailForViewport({ chr, vp, canvasWidth, expandThreshold, xToBp }) {
    if (!chr) return false;

    const vpWidth = vp.maxX - vp.minX;
    if (vpWidth <= 0) return false;

    // --- Cache check (layout coords, no bp needed) ---
    if (fetchedRegion &&
        fetchedRegion.chr === chr &&
        fetchedRegion.expandThreshold === expandThreshold &&
        vp.minX >= fetchedRegion.minX &&
        vp.maxX <= fetchedRegion.maxX) {
        return false;
    }

    // Margin: 30% of viewport width in layout units
    const margin = vpWidth * 0.3;
    const fetchMinX = vp.minX - margin;
    const fetchMaxX = vp.maxX + margin;

    // Convert layout bounds -> bp only for the API call
    const bpLeft = xToBp(fetchMinX);
    const bpRight = xToBp(fetchMaxX);
    if (bpLeft === null || bpRight === null) return false;
    const ppbp = canvasWidth / (xToBp(vp.maxX) - xToBp(vp.minX));

    // Cancel any in-flight request
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();
    const signal = fetchController.signal;

    const url = `/detail-tiles?genome=${encodeURIComponent(state.GENOME)}`
        + `&chromosome=${encodeURIComponent(chr)}`
        + `&start=${Math.max(0, Math.round(bpLeft))}&end=${Math.round(bpRight)}`
        + `&ppbp=${ppbp}&expand=${expandThreshold}`
        + `&layout_min_x=${fetchMinX.toFixed(1)}&layout_max_x=${fetchMaxX.toFixed(1)}`;

    state.isFetching = true;
    try {
        const resp = await fetch(url, { signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const apiData = await resp.json();
        if (signal.aborted) return false;

        fetchedRegion = { minX: fetchMinX, maxX: fetchMaxX, chr, expandThreshold };
        state.detailData = processResponse(apiData);
        return true;
    } catch (e) {
        if (e.name !== 'AbortError') console.warn('Detail fetch failed:', e);
        return false;
    } finally {
        state.isFetching = false;
    }
}

// ---------------------------------------------------------------
// Public: clear fetch state
// ---------------------------------------------------------------
export function clearFetchedRegion() {
    fetchedRegion = null;
}
