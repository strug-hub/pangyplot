// Progressive detail: fetch, cache, fade animation, phase state machine.

import { state } from './simplify-state.js';
import { xToBp, getChromosome, isReady } from './spine.js';
import { getViewport } from './viewport.js';
import { scheduleFrame, updateDetailBar } from './render.js';
import { selectLevel } from './lod.js';
import { clearForce, addPoppedNodes, removePoppedNodes, collapseToAnchors, restoreAnchors } from './simplify-force.js';
import { deserializeChainGraph } from './simplify-detail-adapter.js';

let fadeStartTime = 0;
let fetchController = null;
let fetchTimer = null;
let collapseTimer = null;
const COLLAPSE_DURATION = 400;  // ms to let nodes settle before fade-out

// ---------------------------------------------------------------
// Parse API response into internal format
// ---------------------------------------------------------------
function processChainsResponse(apiResponse) {
    const chains = [];
    let totalBubbles = 0;
    for (const chain of apiResponse.chains) {
        chains.push({
            id: chain.id,
            polyline: chain.polyline,   // [[x,y], ...]
            length: chain.length,
            nBubbles: chain.n_bubbles,
            subtype: chain.subtype,
            depth: chain.depth || 0,
            connector: chain.connector || false,
            bubbleIds: chain.bubble_ids || null,
            sourceSegs: chain.source_segs,
            sinkSegs: chain.sink_segs,
            bubblePositions: chain.bubble_positions || null,
        });
        totalBubbles += chain.n_bubbles;
    }

    const bubbles = [];
    for (const b of (apiResponse.bubbles || [])) {
        bubbles.push({
            id: b.id,
            x: b.x,
            y: b.y,
            rx: b.rx,
            ry: b.ry,
            subtype: b.subtype,
            length: b.length,
            chain: b.chain,
        });
    }

    return { chains, bubbles, totalBubbles };
}

// ---------------------------------------------------------------
// Detail phase state machine
// ---------------------------------------------------------------
export function setDetailPhase(phase) {
    state.detailPhase = phase;
    const cls = (phase === 'fading-in' || phase === 'fading-out') ? 'fading'
               : phase === 'collapsing' ? 'fading' : phase;
    state.dom.detailPhase.className = cls;
    state.dom.detailPhase2.className = cls;
    const labels = {
        'none': '', 'fading-in': 'DETAILS', 'fading-out': 'DETAILS',
        'static': 'DETAILS', 'collapsing': 'DETAILS',
    };
    state.dom.detailPhase.textContent = labels[phase] || '';
    state.dom.detailPhase2.textContent = labels[phase] || '';

    // Show/hide detail bar
    if (phase === 'none') {
        state.dom.detailBar.classList.remove('active');
    } else {
        state.dom.detailBar.classList.add('active');
        updateDetailBar();
    }
}

function finishExit() {
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    clearForce();
    currentPoppedIds = null;
    state.detailData = null;
    state.detailCache = null;
    state.detailOpacity = 0;
    state.skeletonOpacity = 1;
    setDetailPhase('none');
    scheduleFrame();
}

export function exitDetailMode() {
    if (state.detailPhase === 'none' || state.detailPhase === 'fading-out') return;

    // If already collapsing, let it finish
    if (state.detailPhase === 'collapsing') return;

    // Start collapse: pull nodes back to polyline positions
    setDetailPhase('collapsing');
    collapseToAnchors(0.6);

    // After collapse settles, start the fade-out
    collapseTimer = setTimeout(() => {
        collapseTimer = null;
        if (state.detailPhase !== 'collapsing') return;  // cancelled
        fadeStartTime = performance.now();
        setDetailPhase('fading-out');
        scheduleFadeFrame();
    }, COLLAPSE_DURATION);
}

/**
 * Cancel an in-progress collapse (e.g. user zoomed back in).
 * Restores normal anchor strength and returns to static phase.
 */
function cancelCollapse() {
    if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
    }
    // Restore fixed positions on anchor nodes and normal anchor strength
    restoreAnchors();
    setDetailPhase('static');
    scheduleFrame();
}

export function updateDetailOpacity() {
    const now = performance.now();
    const elapsed = now - fadeStartTime;
    const t = Math.min(1, elapsed / state.FADE_DURATION);

    if (state.detailPhase === 'fading-in') {
        state.detailOpacity = t;
        state.skeletonOpacity = Math.max(0.1, 1 - t);

        if (t < 1) {
            scheduleFadeFrame();
        } else {
            // Fade-in complete — chains are static
            state.detailOpacity = 1;
            state.skeletonOpacity = 0.1;
            setDetailPhase('static');
        }
    } else if (state.detailPhase === 'fading-out') {
        state.detailOpacity = 1 - t;
        state.skeletonOpacity = Math.max(0.1, t);

        if (t < 1) {
            scheduleFadeFrame();
        } else {
            finishExit();
            return;
        }
    }
    // In 'static' or 'physics' phase, opacity stays at 1/0.1
    state.dom.detailOpacity.textContent = state.detailOpacity.toFixed(2);
}

export function scheduleFadeFrame() {
    // Drive the fade animation independent of user interaction
    requestAnimationFrame(() => {
        if (state.detailPhase === 'fading-in' || state.detailPhase === 'fading-out') {
            updateDetailOpacity();
            scheduleFrame();
        }
    });
}

// ---------------------------------------------------------------
// Fetch chains data for current viewport
// ---------------------------------------------------------------
export async function fetchChainsForViewport() {
    const chr = getChromosome();
    if (!isReady() || !chr) return;

    const vp = getViewport();
    const bpLeft = xToBp(vp.minX);
    const bpRight = xToBp(vp.maxX);
    if (bpLeft === null || bpRight === null) return;

    const span = bpRight - bpLeft;
    const marginBp = span * state.FETCH_MARGIN;
    const fetchStart = Math.max(0, Math.round(bpLeft - marginBp));
    const fetchEnd = Math.round(bpRight + marginBp);

    // Derive expand threshold early so we can check cache validity
    const li = selectLevel();
    const cellSize = state.data.levels[li]?.cellSize || 50;
    const expandThreshold = Math.round(cellSize * 2);

    // Reuse cache if viewport is within cached range and threshold hasn't changed
    if (state.detailCache &&
        fetchStart >= state.detailCache.bpStart &&
        fetchEnd <= state.detailCache.bpEnd &&
        expandThreshold === state.detailCache.expandThreshold) {
        // If collapsing (zoomed back in before collapse finished), cancel it
        if (state.detailPhase === 'collapsing') cancelCollapse();
        return;
    }

    // Cancel any in-flight fetch
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();

    let url = `/chains?genome=${encodeURIComponent(state.GENOME)}&chromosome=${encodeURIComponent(chr)}&start=${fetchStart}&end=${fetchEnd}&expand=${expandThreshold}`;

    try {
        const resp = await fetch(url, { signal: fetchController.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const apiData = await resp.json();

        const processed = processChainsResponse(apiData);

        state.detailCache = { bpStart: fetchStart, bpEnd: fetchEnd, expandThreshold, data: processed };
        // Carry over poppedChains so polylines stay hidden during async pop
        if (currentPoppedIds) processed.poppedChains = currentPoppedIds;
        state.detailData = processed;

        // Pop chains into force simulation
        popChainsForViewport(processed.chains, chr, fetchController.signal);

        if (state.detailPhase === 'none') {
            fadeStartTime = performance.now();
            setDetailPhase('fading-in');
            scheduleFadeFrame();
        } else if (state.detailPhase === 'collapsing') {
            // Data arrived while collapsing — cancel collapse, stay in detail
            cancelCollapse();
        } else if (state.detailPhase === 'fading-out') {
            // Data arrived while fading out — reverse the fade
            const remaining = state.detailOpacity;
            fadeStartTime = performance.now() - remaining * state.FADE_DURATION;
            setDetailPhase('fading-in');
            scheduleFadeFrame();
        }
        scheduleFrame();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Detail fetch error:', err);
        }
    }
}

// ---------------------------------------------------------------
// Pop chains: fetch subgraphs and add to force simulation
// ---------------------------------------------------------------
const POP_BUDGET = 2000;  // total bubble budget across all popped chains
let currentPoppedIds = null;  // Set of chain IDs currently in the force sim

async function popChainsForViewport(chains, chr, signal) {
    // Sort candidates by bubble count (smallest first) to maximize chains popped
    const candidates = chains
        .filter(c => c.nBubbles > 0)
        .sort((a, b) => a.nBubbles - b.nBubbles);

    // Fill budget greedily
    const toPop = [];
    let budget = 0;
    for (const c of candidates) {
        if (budget + c.nBubbles > POP_BUDGET) continue;
        toPop.push(c);
        budget += c.nBubbles;
    }

    const newIds = new Set(toPop.map(c => c.id));

    // Nothing to pop — clear everything
    if (toPop.length === 0) {
        clearForce();
        currentPoppedIds = null;
        if (state.detailData) state.detailData.poppedChains = null;
        return;
    }

    // Identical set already popped — nothing to do
    if (currentPoppedIds && newIds.size === currentPoppedIds.size &&
        [...newIds].every(id => currentPoppedIds.has(id))) {
        if (state.detailData) state.detailData.poppedChains = newIds;
        return;
    }

    // --- Incremental update: remove stale, keep existing, fetch new ---
    const kept = currentPoppedIds ? [...currentPoppedIds].filter(id => newIds.has(id)) : [];
    const keptSet = new Set(kept);
    const toRemove = currentPoppedIds ? [...currentPoppedIds].filter(id => !newIds.has(id)) : [];
    const toFetch = toPop.filter(c => !keptSet.has(c.id));

    // Remove chains no longer in the set (keeps existing nodes in place)
    for (const id of toRemove) {
        removePoppedNodes(id);
    }

    // Fetch subgraphs only for newly added chains
    if (toFetch.length > 0) {
        const fetches = toFetch.map(async (chain) => {
            let url = `/chain-graph?id=${encodeURIComponent(chain.id)}&genome=${encodeURIComponent(state.GENOME)}&chromosome=${encodeURIComponent(chr)}`;
            if (chain.bubbleIds) {
                url += `&bubbles=${chain.bubbleIds.join(',')}`;
            }
            try {
                const resp = await fetch(url, { signal });
                if (!resp.ok) return null;
                const data = await resp.json();
                return { chain, data };
            } catch (e) {
                if (e.name !== 'AbortError') console.warn(`Pop fetch failed for ${chain.id}:`, e);
                return null;
            }
        });

        const results = await Promise.all(fetches);
        const newNodes = [];
        const newLinks = [];
        const fetchedIds = [];  // track which chains actually produced nodes

        for (const result of results) {
            if (!result || !result.data.nodes || result.data.nodes.length === 0) continue;
            fetchedIds.push(result.chain.id);
            const { chain, data } = result;

            const { nodes, links } = deserializeChainGraph(data, chain);
            newNodes.push(...nodes);
            newLinks.push(...links);
        }

        if (newNodes.length > 0) {
            addPoppedNodes(newNodes, newLinks);
        }

        // Only mark chains as popped if they actually produced nodes
        // (kept chains already have nodes; newly fetched need confirmation)
        for (const id of toFetch.map(c => c.id)) {
            if (!fetchedIds.includes(id)) newIds.delete(id);
        }
    }

    // Update tracking
    currentPoppedIds = newIds;
    if (state.detailData) state.detailData.poppedChains = newIds;
    scheduleFrame();
}

export function scheduleDetailFetch() {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
        selectLevel();
        if (state.targetCell <= state.DETAIL_CELL_THRESHOLD) {
            fetchChainsForViewport();
        } else {
            exitDetailMode();
        }
    }, 200);
}
