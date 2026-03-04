// Progressive detail: single-viewport fetch, fade animation, phase state machine.
//
// Fetches chain polylines from /detail-tiles for the whole visible region at once.
// No bubble popping or force simulation — chains are drawn as static polylines.

import { state } from './simplify-state.js';
import { xToBp, getChromosome, isReady } from './spine.js';
import { getViewport } from './viewport.js';
import { scheduleFrame, updateDetailBar } from './render.js';
import { selectLevel } from './lod.js';

let fadeStartTime = 0;
let fetchController = null;
let fetchTimer = null;

// Viewport layout bounds of the last successful fetch (with margin applied).
// Re-fetch only when the current viewport extends outside this region,
// or when expandThreshold changes (LOD level switched).
let fetchedRegion = null; // { minX, maxX, chr, expandThreshold } — layout coords

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
        chainAdjacency: apiResponse.chain_adjacency || {},
        siblingConnectors: apiResponse.sibling_connectors || [],
    };
}

// ---------------------------------------------------------------
// Clear detail fetch state
// ---------------------------------------------------------------
function clearDetailState() {
    fetchedRegion = null;
    state.detailData = null;
}

// ---------------------------------------------------------------
// Detail phase state machine
// ---------------------------------------------------------------
export function setDetailPhase(phase) {
    state.detailPhase = phase;
    const cls = (phase === 'fading-in' || phase === 'fading-out') ? 'fading' : phase;
    state.dom.detailPhase.className = cls;
    state.dom.detailPhase2.className = cls;
    const labels = {
        'none': '', 'fading-in': 'DETAILS', 'fading-out': 'DETAILS', 'static': 'DETAILS',
    };
    state.dom.detailPhase.textContent = labels[phase] || '';
    state.dom.detailPhase2.textContent = labels[phase] || '';

    if (phase === 'none') {
        state.dom.detailBar.classList.remove('active');
    } else {
        state.dom.detailBar.classList.add('active');
        updateDetailBar();
    }
}

function finishExit() {
    clearDetailState();
    state.detailOpacity = 0;
    state.skeletonOpacity = 1;
    setDetailPhase('none');
    scheduleFrame();
}

export function exitDetailMode() {
    if (state.detailPhase === 'none' || state.detailPhase === 'fading-out') return;
    fadeStartTime = performance.now();
    setDetailPhase('fading-out');
    scheduleFadeFrame();
}

export function updateDetailOpacity() {
    const now = performance.now();
    const elapsed = now - fadeStartTime;
    const t = Math.min(1, elapsed / state.FADE_DURATION);

    if (state.detailPhase === 'fading-in') {
        state.detailOpacity = t;
        state.skeletonOpacity = Math.max(0.06, 1 - t);

        if (t < 1) {
            scheduleFadeFrame();
        } else {
            state.detailOpacity = 1;
            state.skeletonOpacity = 0.06;
            setDetailPhase('static');
        }
    } else if (state.detailPhase === 'fading-out') {
        state.detailOpacity = 1 - t;
        state.skeletonOpacity = Math.max(0.06, t);

        if (t < 1) {
            scheduleFadeFrame();
        } else {
            finishExit();
            return;
        }
    }
    state.dom.detailOpacity.textContent = state.detailOpacity.toFixed(2);
}

export function scheduleFadeFrame() {
    requestAnimationFrame(() => {
        if (state.detailPhase === 'fading-in' || state.detailPhase === 'fading-out') {
            updateDetailOpacity();
            scheduleFrame();
        }
    });
}

// ---------------------------------------------------------------
// Single-viewport fetch for current visible region
// ---------------------------------------------------------------
async function fetchDetailForViewport() {
    const chr = getChromosome();
    if (!isReady() || !chr) return;

    const vp = getViewport();            // { minX, maxX, minY, maxY } — layout coords
    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const vpWidth = vp.maxX - vp.minX;
    if (vpWidth <= 0) return;

    const li = selectLevel();
    const cellSize = state.data.levels[li]?.cellSize || 50;
    const expandThreshold = Math.round(cellSize * 2);

    // --- Cache check (layout coords, no bp needed) ---
    if (fetchedRegion &&
        fetchedRegion.chr === chr &&
        fetchedRegion.expandThreshold === expandThreshold &&
        vp.minX >= fetchedRegion.minX &&
        vp.maxX <= fetchedRegion.maxX) {
        return; // viewport still inside buffered region
    }

    // Margin: 30% of viewport width in layout units
    const margin = vpWidth * 0.3;
    const fetchMinX = vp.minX - margin;
    const fetchMaxX = vp.maxX + margin;

    // Convert layout bounds → bp only for the API call
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

    state.dom.fetchIndicator.classList.add('active');
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
        state.dom.fetchIndicator.classList.remove('active');
    }
}

// ---------------------------------------------------------------
// Public: debounced detail fetch trigger
// ---------------------------------------------------------------
export function scheduleDetailFetch() {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
        selectLevel();
        if (state.targetCell > state.DETAIL_CELL_THRESHOLD) {
            // Zoomed out past threshold — clear suppression and exit detail
            state.detailSuppressed = false;
            exitDetailMode();
        } else if (state.detailSuppressed) {
            exitDetailMode();
        } else {
            fetchDetailForViewport();
        }
    }, 200);
}
