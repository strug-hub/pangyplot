// Progressive detail: fetch, cache, fade animation, phase state machine.

import { state } from './simplify-state.js';
import { xToBp, getChromosome, isReady } from './spine.js';
import { getViewport } from './viewport.js';
import { scheduleFrame, updateDetailBar } from './render.js';
import { selectLevel } from './lod.js';
import { clearForce, addPoppedNodes, removePoppedNodes, collapseToAnchors, restoreAnchors, getForceNodes, addInterChainLinks, removeInterChainLinks } from './simplify-force.js';
import { deserializeChainGraph, createInterChainLinks } from './simplify-detail-adapter.js';

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
    currentPoppedMap = null;
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
    collapseToAnchors();

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
        if (currentPoppedMap) processed.poppedChains = new Set(currentPoppedMap.keys());
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
// Viewport-clipped partial chain helpers
// ---------------------------------------------------------------

/** Get bp extent of a chain from its polyline endpoints via xToBp(). */
function chainBpExtent(chain) {
    const pl = chain.polyline;
    if (!pl || pl.length < 2) return null;
    const bpStart = xToBp(pl[0][0]);
    const bpEnd = xToBp(pl[pl.length - 1][0]);
    if (bpStart === null || bpEnd === null) return null;
    return { bpStart: Math.min(bpStart, bpEnd), bpEnd: Math.max(bpStart, bpEnd) };
}

/** Returns true if chain spans > 2× viewport and has > 50 bubbles. */
function isLargeChain(chain, vpBpStart, vpBpEnd) {
    if (chain.bubbleIds) return false;  // connector chains use explicit IDs
    if (chain.nBubbles <= 50) return false;
    const ext = chainBpExtent(chain);
    if (!ext) return false;
    const vpSpan = vpBpEnd - vpBpStart;
    const chainSpan = ext.bpEnd - ext.bpStart;
    return chainSpan > vpSpan * 2;
}

/**
 * Determine the visible chain_step range for a chain within the viewport.
 * margin is a fractional extension (e.g. 0.2 = 20% extra on each side).
 */
function visiblePosRange(chain, vpBpStart, vpBpEnd, margin) {
    const bp = chain.bubblePositions;
    if (!bp || bp.length === 0) return null;

    const ext = chainBpExtent(chain);
    if (!ext) return null;

    const chainBpSpan = ext.bpEnd - ext.bpStart;
    if (chainBpSpan <= 0) return null;

    // Convert viewport bp boundaries to fractional t along the chain
    let tStart = (vpBpStart - ext.bpStart) / chainBpSpan;
    let tEnd = (vpBpEnd - ext.bpStart) / chainBpSpan;

    // Apply margin
    const tMargin = (tEnd - tStart) * margin;
    tStart -= tMargin;
    tEnd += tMargin;

    // Filter bubblePositions to those within [tStart, tEnd]
    let minPos = Infinity, maxPos = -Infinity;
    for (const bp_entry of bp) {
        if (bp_entry.t >= tStart && bp_entry.t <= tEnd) {
            if (bp_entry.pos < minPos) minPos = bp_entry.pos;
            if (bp_entry.pos > maxPos) maxPos = bp_entry.pos;
        }
    }

    if (minPos === Infinity) return null;
    return { startPos: minPos, endPos: maxPos, tStart, tEnd };
}

/** Estimate how many bubbles are visible for budget purposes. */
function estimateVisibleBubbles(chain, vpBpStart, vpBpEnd) {
    const ext = chainBpExtent(chain);
    if (!ext) return chain.nBubbles;
    const chainSpan = ext.bpEnd - ext.bpStart;
    if (chainSpan <= 0) return chain.nBubbles;
    const visibleSpan = Math.min(vpBpEnd, ext.bpEnd) - Math.max(vpBpStart, ext.bpStart);
    const fraction = Math.max(0, Math.min(1, visibleSpan / chainSpan));
    return Math.ceil(chain.nBubbles * fraction);
}

// ---------------------------------------------------------------
// Pop chains: fetch subgraphs and add to force simulation
// ---------------------------------------------------------------
const POP_BUDGET = 2000;  // total bubble budget across all popped chains
// Map of chainId → { startPos, endPos, isPartial } for tracking what's fetched
let currentPoppedMap = null;

function buildInterChainLinks(chains) {
    removeInterChainLinks();

    if (!currentPoppedMap || currentPoppedMap.size < 2) return;

    const poppedChains = chains.filter(c => currentPoppedMap.has(c.id));
    const forceNodes = getForceNodes();
    const links = createInterChainLinks(poppedChains, forceNodes);

    if (links.length > 0) {
        addInterChainLinks(links);
    }
}

/** Check if a partially-fetched chain needs refetch because viewport shifted. */
function needsRefetch(chainId, chain, vpBpStart, vpBpEnd) {
    const entry = currentPoppedMap.get(chainId);
    if (!entry) return true;        // not yet fetched
    if (!entry.isPartial) return false;  // full fetch, never needs refetch

    const range = visiblePosRange(chain, vpBpStart, vpBpEnd, 0.2);
    if (!range) return false;

    // Refetch if the visible range exceeds what we already fetched
    return range.startPos < entry.startPos || range.endPos > entry.endPos;
}

async function popChainsForViewport(chains, chr, signal) {
    // Compute viewport bp range for partial clipping
    const vp = getViewport();
    const vpBpStart = xToBp(vp.minX);
    const vpBpEnd = xToBp(vp.maxX);

    // Sort candidates by bubble count (smallest first) to maximize chains popped
    const candidates = chains
        .filter(c => c.nBubbles > 0)
        .sort((a, b) => a.nBubbles - b.nBubbles);

    // Fill budget greedily, using estimated visible bubbles for large chains
    const toPop = [];
    let budget = 0;
    for (const c of candidates) {
        const cost = (vpBpStart !== null && vpBpEnd !== null && isLargeChain(c, vpBpStart, vpBpEnd))
            ? estimateVisibleBubbles(c, vpBpStart, vpBpEnd)
            : c.nBubbles;
        if (budget + cost > POP_BUDGET) continue;
        toPop.push(c);
        budget += cost;
    }

    // Annotate large chains with visible position range
    if (vpBpStart !== null && vpBpEnd !== null) {
        for (const c of toPop) {
            if (isLargeChain(c, vpBpStart, vpBpEnd)) {
                const range = visiblePosRange(c, vpBpStart, vpBpEnd, 0.3);
                if (range) {
                    c._startPos = range.startPos;
                    c._endPos = range.endPos;
                    c._clipTStart = range.tStart;
                    c._clipTEnd = range.tEnd;
                } else {
                    c._startPos = null;
                    c._endPos = null;
                }
            } else {
                c._startPos = null;
                c._endPos = null;
            }
        }
    }

    const newIds = new Set(toPop.map(c => c.id));

    // Nothing to pop — clear everything
    if (toPop.length === 0) {
        clearForce();
        currentPoppedMap = null;
        if (state.detailData) state.detailData.poppedChains = null;
        return;
    }

    // --- Determine which chains to fetch/keep/remove ---
    const toFetch = [];
    const keptSet = new Set();

    if (currentPoppedMap) {
        for (const c of toPop) {
            if (currentPoppedMap.has(c.id)) {
                // Check if partial chain needs refetch due to viewport shift
                if (vpBpStart !== null && vpBpEnd !== null &&
                    needsRefetch(c.id, c, vpBpStart, vpBpEnd)) {
                    toFetch.push(c);
                } else {
                    keptSet.add(c.id);
                }
            } else {
                toFetch.push(c);
            }
        }
    } else {
        toFetch.push(...toPop);
    }

    // Nothing changed — keep everything as is
    if (toFetch.length === 0 && currentPoppedMap &&
        keptSet.size === currentPoppedMap.size) {
        if (state.detailData) state.detailData.poppedChains = newIds;
        return;
    }

    // Remove chains no longer in the set + chains being refetched
    const toRemove = currentPoppedMap
        ? [...currentPoppedMap.keys()].filter(id => !keptSet.has(id))
        : [];
    for (const id of toRemove) {
        removePoppedNodes(id);
    }

    // Fetch subgraphs only for newly added / refetched chains
    if (toFetch.length > 0) {
        const fetches = toFetch.map(async (chain) => {
            let url = `/chain-graph?id=${encodeURIComponent(chain.id)}&genome=${encodeURIComponent(state.GENOME)}&chromosome=${encodeURIComponent(chr)}`;
            if (chain.bubbleIds) {
                url += `&bubbles=${chain.bubbleIds.join(',')}`;
            }
            if (chain._startPos != null) {
                url += `&start_pos=${chain._startPos}&end_pos=${chain._endPos}`;
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

            const clipRange = (chain._startPos != null && chain._clipTStart != null)
                ? { tStart: chain._clipTStart, tEnd: chain._clipTEnd }
                : null;

            const { nodes, links } = deserializeChainGraph(data, chain, clipRange);
            newNodes.push(...nodes);
            newLinks.push(...links);
        }

        if (newNodes.length > 0) {
            addPoppedNodes(newNodes, newLinks);
        }

        // Only mark chains as popped if they actually produced nodes
        for (const id of toFetch.map(c => c.id)) {
            if (!fetchedIds.includes(id)) newIds.delete(id);
        }
    }

    // Update tracking map
    const newMap = new Map();
    for (const c of toPop) {
        if (!newIds.has(c.id)) continue;
        if (c._startPos != null) {
            newMap.set(c.id, { startPos: c._startPos, endPos: c._endPos, isPartial: true });
        } else {
            newMap.set(c.id, { startPos: null, endPos: null, isPartial: false });
        }
    }
    currentPoppedMap = newMap;
    if (state.detailData) state.detailData.poppedChains = newIds;

    // Build inter-chain links between adjacent popped chains
    buildInterChainLinks(chains);

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
