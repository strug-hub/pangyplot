// Progressive detail: fetch, cache, fade animation, phase state machine.

import { state } from './simplify-state.js';
import { xToBp, getChromosome, isReady } from './spine.js';
import { getViewport } from './viewport.js';
import { formatBp } from './format-utils.js';
import { scheduleFrame, updateDetailBar } from './render.js';
import { selectLevel } from './lod.js';
import { stopPhysics } from './physics.js';
import { clearForce, addPoppedNodes, collapseToAnchors } from './simplify-force.js';

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
    console.log(`[phase] ${state.detailPhase} -> ${phase}`);
    state.detailPhase = phase;
    const cls = (phase === 'fading-in' || phase === 'fading-out') ? 'fading'
               : phase === 'collapsing' ? 'fading' : phase;
    state.dom.detailPhase.className = cls;
    state.dom.detailPhase2.className = cls;
    const labels = {
        'none': '', 'fading-in': 'CHAINS', 'fading-out': 'CHAINS',
        'static': 'CHAINS', 'collapsing': 'CHAINS',
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
    stopPhysics();
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
    // Restore normal anchor strength by re-adding with default
    collapseToAnchors(0.15);
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
        console.log(`[detail] cache HIT: viewport ${Math.round(fetchStart/1000)}k-${Math.round(fetchEnd/1000)}k within cached ${Math.round(state.detailCache.bpStart/1000)}k-${Math.round(state.detailCache.bpEnd/1000)}k, expand=${expandThreshold}`);
        // If collapsing (zoomed back in before collapse finished), cancel it
        if (state.detailPhase === 'collapsing') cancelCollapse();
        return;
    }

    // Cancel any in-flight fetch
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();

    let url = `/chains?genome=${encodeURIComponent(state.GENOME)}&chromosome=${encodeURIComponent(chr)}&start=${fetchStart}&end=${fetchEnd}&expand=${expandThreshold}`;
    console.log(`[detail] FETCH /chains: ${Math.round(fetchStart/1000)}k-${Math.round(fetchEnd/1000)}k (${Math.round((fetchEnd-fetchStart)/1000)}kb span, expand>${expandThreshold} = cellSize ${cellSize} * 2)`);

    try {
        const t0 = performance.now();
        const resp = await fetch(url, { signal: fetchController.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const apiData = await resp.json();

        const processed = processChainsResponse(apiData);
        const totalPts = processed.chains.reduce((s, c) => s + c.polyline.length, 0);
        console.log(`[detail]   /chains response: ${processed.chains.length} chains, ${processed.bubbles.length} exposed bubbles, ${processed.totalBubbles} chain-bubbles, ${totalPts} polyline pts (${(performance.now()-t0).toFixed(0)}ms)`);

        state.detailCache = { bpStart: fetchStart, bpEnd: fetchEnd, expandThreshold, data: processed };
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
const POP_MAX_BUBBLES = 80;  // only pop chains with <= this many bubbles

async function popChainsForViewport(chains, chr, signal) {
    clearForce();

    // Filter to poppable chains (small enough, not connectors)
    const toPop = chains.filter(c => !c.connector && c.nBubbles <= POP_MAX_BUBBLES && c.nBubbles > 0);
    if (toPop.length === 0) return;

    // Mark which chains are popped so render can skip their polylines
    const poppedSet = new Set();

    console.log(`[detail] popping ${toPop.length}/${chains.length} chains (max ${POP_MAX_BUBBLES} bubbles each)`);

    // Fetch subgraphs for all poppable chains in parallel
    const fetches = toPop.map(async (chain) => {
        // Use the chain's polyline bbox to derive bp range
        const pl = chain.polyline;
        const minX = Math.min(...pl.map(p => p[0]));
        const maxX = Math.max(...pl.map(p => p[0]));

        // Convert layout x to bp via spine
        const bpStart = xToBp(minX);
        const bpEnd = xToBp(maxX);
        if (bpStart === null || bpEnd === null) return null;

        const url = `/select?genome=${encodeURIComponent(state.GENOME)}&chromosome=${encodeURIComponent(chr)}&start=${Math.round(bpStart)}&end=${Math.round(bpEnd)}`;
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

    // Convert API results to force nodes+links
    const allNodes = [];
    const allLinks = [];

    for (const result of results) {
        if (!result || !result.data.nodes || result.data.nodes.length === 0) continue;
        const { chain, data } = result;

        for (const node of data.nodes) {
            const cx = (node.x1 + node.x2) / 2;
            const cy = (node.y1 + node.y2) / 2;
            const seqLen = node.length || 1;
            // Width from seqLength (log scale), capped for visual balance
            const width = Math.min(20, Math.max(3, Math.log10(seqLen + 1) * 4));
            // Collision radius in data-space
            const radius = width / 2;
            allNodes.push({
                id: node.id,
                chainId: chain.id,
                x: cx,
                y: cy,
                width,
                radius,
                type: node.type,
                seqLength: seqLen,
                siblings: node.siblings,
                gcCount: node.gc_count || 0,
                isRef: node.is_ref || false,
            });
        }

        // Create links from sibling relationships (bubble → next bubble)
        const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
        for (const node of data.nodes) {
            if (!node.siblings) continue;
            const nextId = node.siblings[1];
            if (nextId != null) {
                const targetId = `b${nextId}`;
                if (nodeMap.has(targetId)) {
                    // Link distance proportional to connected node sizes
                    const srcLen = node.length || 1;
                    const tgtLen = nodeMap.get(targetId).length || 1;
                    const dist = Math.max(5, (Math.log10(srcLen + 1) + Math.log10(tgtLen + 1)) * 3);
                    allLinks.push({
                        source: node.id,
                        target: targetId,
                        length: dist,
                        chainId: chain.id,
                    });
                }
            }
        }

        poppedSet.add(chain.id);
    }

    if (allNodes.length > 0) {
        // Mark chains as popped in detailData so render skips their polylines
        if (state.detailData) {
            state.detailData.poppedChains = poppedSet;
        }

        console.log(`[detail] popped: ${poppedSet.size} chains, ${allNodes.length} nodes, ${allLinks.length} links`);
        addPoppedNodes(allNodes, allLinks);
        scheduleFrame();
    }
}

export function scheduleDetailFetch() {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
        const li = selectLevel();
        const cellSize = state.data.levels[li]?.cellSize || 50;
        console.log(`[detail] scheduleDetailFetch: cellSize=${cellSize}, zoom=${state.zoom.toFixed(2)}, threshold=${state.DETAIL_CELL_THRESHOLD}, phase=${state.detailPhase}`);
        if (cellSize <= state.DETAIL_CELL_THRESHOLD) {
            console.log(`[detail]   -> cellSize <= threshold, fetching chains...`);
            fetchChainsForViewport();
        } else {
            console.log(`[detail]   -> cellSize > threshold, exiting detail mode`);
            exitDetailMode();
        }
    }, 200);
}
