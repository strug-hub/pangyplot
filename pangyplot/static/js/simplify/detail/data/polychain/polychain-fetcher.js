// Progressive detail: single-viewport fetch, response parsing.
// Pure data-fetching — no skeleton imports, no UI imports, no fade or LOD decisions.
// Uses incremental merge: new chains are added, stale chains removed surgically.

import { state } from '../../../simplify-state.js';
import { colorState } from '../../../../graph/render/color/color-state.js';
import { recordPop, clearHistory } from '../../../../utils/pop-history.js';
import { removeNodesByChainIds } from '../../engines/force-engine.js';
import { unregisterChains } from '../simplify-view-state.js';
import { initPolychainLayer, addChainsToPolychainLayer, removeChainsFromPolychainLayer } from './polychain-adapter.js';
import { fetchGenesForDetail } from './polychain-gene-map.js';
import { placeGenesFromDetail } from '../../../skeleton/data/gene-data.js';

let fetchController = null;

// Layout bounds of the union of all successful fetches.
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
            gcCount: chain.gc_count || 0,
            bpSpan: chain.bp_span || chain.length,
            nBubbles: chain.n_bubbles,
            // Color proxy fields — shape matches what getNodeColor() reads
            type: 'chain',
            size: chain.n_bubbles,
            isRef: chain.bp_start != null,
            record: {
                seqLength: chain.length,
                gcCount: chain.gc_count || 0,
                start: chain.bp_start ?? null,
                end: chain.bp_end ?? null,
            },
            subtype: chain.subtype,
            depth: chain.depth || 0,
            connector: chain.connector || false,
            bubbleIds: chain.bubble_ids || null,
            sourceSegs: chain.source_segs,
            sinkSegs: chain.sink_segs,
            bubblePositions: chain.bubble_positions || null,
            polychainNodes: chain.polychain_nodes || null,
            bpStart: chain.bp_start ?? null,
            bpEnd: chain.bp_end ?? null,
            bpHead: chain.bp_head ?? null,
            bpTail: chain.bp_tail ?? null,
            stepCount: chain.step_count || 0,
            parentChain: chain.parent_chain || null,
            ancestors: chain.ancestors || [],
            parentBubble: chain.parent_bubble || null,
            parentSubtype: chain.parent_subtype || null,
            minStep: chain._min_step ?? null,
            maxStep: chain._max_step ?? null,
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
        junctionLinks: (apiResponse.junction_links || []).map(l => ({
            coords: [l[0], l[1]],
            segs: [l[2], l[3]],
        })),
        junctionGraph: apiResponse.junction_graph || { nodes: [], links: [] },
        junctionSegChains: apiResponse.junction_seg_chains || {},
        chainAdjacency: apiResponse.chain_adjacency || {},
    };
}

// ---------------------------------------------------------------
// Single-viewport fetch for current visible region.
// Caller provides pre-computed viewport and coordinate info.
// Returns true if new data was fetched, false otherwise.
// ---------------------------------------------------------------
export async function fetchDetailForViewport({ chr, vp, canvasWidth, xToBp }) {
    if (!chr) return false;

    const vpWidth = vp.maxX - vp.minX;
    if (vpWidth <= 0) return false;

    // --- Cache check (layout coords, no bp needed) ---
    if (fetchedRegion &&
        fetchedRegion.chr === chr &&
        vp.minX >= fetchedRegion.minX &&
        vp.maxX <= fetchedRegion.maxX) {
        return false;
    }

    // Margin: 100% of viewport width in layout units (covers ~3x zoom-out)
    const margin = vpWidth * 1.0;
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
        + `&ppbp=${ppbp}`
        + `&layout_min_x=${fetchMinX.toFixed(1)}&layout_max_x=${fetchMaxX.toFixed(1)}`;

    state.isFetching = true;
    try {
        const resp = await fetch(url, { signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const apiData = await resp.json();
        if (signal.aborted) return false;

        const newData = processResponse(apiData);
        const isFirstFetch = !state.detailData || state.detailData.chains.length === 0;

        if (isFirstFetch) {
            // --- First fetch: full initialization ---
            fetchedRegion = { minX: fetchMinX, maxX: fetchMaxX, chr };

            state.poppedChainIds.clear();
            state.activeSeedChainId = null;
            state._bubblePopStack = [];

            clearHistory();
            recordPop('detail-tiles', {
                genome: state.GENOME, chromosome: chr,
                start: Math.max(0, Math.round(bpLeft)), end: Math.round(bpRight),
            });
            state.detailData = newData;
            colorState.positionRange = [newData.bpStart, newData.bpEnd];
            initPolychainLayer();
        } else {
            // --- Incremental merge ---
            const existingIds = new Set(state.detailData.chains.map(c => c.id));
            const incomingIds = new Set(newData.chains.map(c => c.id));

            // New chains = in response but not in current state
            const newChains = newData.chains.filter(c => !existingIds.has(c.id));

            // Removed chains = in current state but not in response AND
            // outside the new fetched region (keep chains in the overlap zone)
            const removedIds = new Set();
            for (const c of state.detailData.chains) {
                if (incomingIds.has(c.id)) continue;
                // Only remove if the chain is entirely outside the new fetch region
                // (use polyline bounds as proxy)
                if (c.polyline && c.polyline.length >= 2) {
                    const chainMinX = Math.min(c.polyline[0][0], c.polyline[c.polyline.length - 1][0]);
                    const chainMaxX = Math.max(c.polyline[0][0], c.polyline[c.polyline.length - 1][0]);
                    if (chainMaxX < fetchMinX || chainMinX > fetchMaxX) {
                        removedIds.add(c.id);
                    }
                    // else: chain overlaps with fetch region but wasn't in response —
                    // keep it (it's in the overlap zone between old and new)
                }
            }

            // Remove stale chains from force sim + phantom maps + viewState
            if (removedIds.size > 0) {
                // Don't remove chains that are currently popped by the user
                for (const cid of state.poppedChainIds) {
                    removedIds.delete(cid);
                }
                if (removedIds.size > 0) {
                    removeChainsFromPolychainLayer(removedIds);
                    removeNodesByChainIds(removedIds);
                    const removedChains = state.detailData.chains.filter(c => removedIds.has(c.id));
                    unregisterChains(removedIds, removedChains);
                }
            }

            // Merge chains: keep existing (minus removed), add new
            const keptChains = state.detailData.chains.filter(c => !removedIds.has(c.id));
            const mergedChains = [...keptChains, ...newChains];

            // Update detailData
            state.detailData = {
                ...newData,
                chains: mergedChains,
                totalBubbles: mergedChains.reduce((sum, c) => sum + c.nBubbles, 0),
            };
            colorState.positionRange = [state.detailData.bpStart, state.detailData.bpEnd];

            // Add phantoms + junction links for new chains only
            if (newChains.length > 0) {
                addChainsToPolychainLayer(newChains, state.detailData);
            }

            // Expand fetchedRegion to union of old and new
            fetchedRegion = {
                minX: Math.min(fetchedRegion.minX, fetchMinX),
                maxX: Math.max(fetchedRegion.maxX, fetchMaxX),
                chr,
            };
        }
        // Trigger gene fetch for the visible bp range (fire and forget)
        fetchGenesForDetail(chr, state.GENOME,
            Math.max(0, Math.round(bpLeft)), Math.round(bpRight));

        // Reposition skeleton gene pins using detail chain data
        placeGenesFromDetail(state.detailData.chains);

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
