// Progressive detail: fetch, cache, fade animation, phase state machine.

import { state } from './simplify-state.js';
import { xToBp, getChromosome, isReady } from './spine.js';
import { getViewport, viewportStepCount } from './viewport.js';
import { formatBp } from './format-utils.js';
import { scheduleFrame, updateDetailBar } from './render.js';
import { startPhysics, stopPhysics, restartPhysics } from './physics.js';

let fadeStartTime = 0;
let fetchController = null;
let fetchTimer = null;

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
    const cls = (phase === 'fading-in' || phase === 'fading-out') ? 'fading' : phase;
    state.dom.detailPhase.className = cls;
    state.dom.detailPhase2.className = cls;
    const labels = {
        'none': '', 'fading-in': 'CHAINS', 'fading-out': 'CHAINS',
        'static': 'CHAINS',
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
    state.detailData = null;
    state.detailCache = null;
    state.detailOpacity = 0;
    state.skeletonOpacity = 1;
    setDetailPhase('none');
    scheduleFrame();
}

export function exitDetailMode() {
    if (state.detailPhase === 'none' || state.detailPhase === 'fading-out') return;
    stopPhysics();
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
        state.skeletonOpacity = Math.max(0.1, 1 - t);

        if (t < 1) {
            scheduleFadeFrame();
        } else {
            // Fade-in complete — chains are static, start physics
            state.detailOpacity = 1;
            state.skeletonOpacity = 0.1;
            setDetailPhase('static');
            startPhysics(state.detailData?.bubbles);
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

    // Reuse cache if viewport is within cached range and zoom hasn't changed much
    if (state.detailCache &&
        fetchStart >= state.detailCache.bpStart &&
        fetchEnd <= state.detailCache.bpEnd) {
        const zoomRatio = state.zoom / (state.detailCache.zoom || state.zoom);
        if (zoomRatio > 0.5 && zoomRatio < 2) {
            console.log(`[detail] cache HIT: viewport ${Math.round(fetchStart/1000)}k-${Math.round(fetchEnd/1000)}k within cached ${Math.round(state.detailCache.bpStart/1000)}k-${Math.round(state.detailCache.bpEnd/1000)}k`);
            return;
        }
        console.log(`[detail] cache STALE: zoom changed ${zoomRatio.toFixed(2)}x, re-fetching for new expand threshold`);
    }

    // Cancel any in-flight fetch
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();

    // Expand bubbles whose layout span exceeds 1/10 of viewport width (in layout units)
    const vp2 = getViewport();
    const viewportLayoutWidth = vp2.maxX - vp2.minX;
    const expandThreshold = Math.round(Math.max(100, viewportLayoutWidth / 10));
    // Expose individual bubbles for chains spanning > 1/8 of viewport
    const bubbleThreshold = Math.round(Math.max(50, viewportLayoutWidth / 8));
    let url = `/chains?genome=${encodeURIComponent(state.GENOME)}&chromosome=${encodeURIComponent(chr)}&start=${fetchStart}&end=${fetchEnd}&expand=${expandThreshold}&bubble=${bubbleThreshold}`;
    console.log(`[detail] FETCH /chains: ${Math.round(fetchStart/1000)}k-${Math.round(fetchEnd/1000)}k (${Math.round((fetchEnd-fetchStart)/1000)}kb span, expand>${expandThreshold}, bubble>${bubbleThreshold} layout units)`);

    try {
        const t0 = performance.now();
        const resp = await fetch(url, { signal: fetchController.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const apiData = await resp.json();

        const processed = processChainsResponse(apiData);
        const totalPts = processed.chains.reduce((s, c) => s + c.polyline.length, 0);
        console.log(`[detail]   /chains response: ${processed.chains.length} chains, ${processed.bubbles.length} exposed bubbles, ${processed.totalBubbles} chain-bubbles, ${totalPts} polyline pts (${(performance.now()-t0).toFixed(0)}ms)`);

        state.detailCache = { bpStart: fetchStart, bpEnd: fetchEnd, zoom: state.zoom, data: processed };
        state.detailData = processed;

        if (state.detailPhase === 'static') {
            restartPhysics(processed.bubbles);
        }
        if (state.detailPhase === 'none') {
            fadeStartTime = performance.now();
            setDetailPhase('fading-in');
            scheduleFadeFrame();
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

export function scheduleDetailFetch() {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
        const steps = viewportStepCount();
        const vp = getViewport();
        const bpLeft = xToBp(vp.minX);
        const bpRight = xToBp(vp.maxX);
        const bpSpan = bpRight - bpLeft;
        console.log(`[detail] scheduleDetailFetch: steps=${Math.round(steps)}, zoom=${state.zoom.toFixed(2)}, viewport=${Math.round(bpSpan/1000)}kb, threshold=${state.NODE_BUDGET_STEPS}, phase=${state.detailPhase}`);
        if (steps < state.NODE_BUDGET_STEPS) {
            console.log(`[detail]   -> steps < threshold, fetching chains...`);
            fetchChainsForViewport();
        } else {
            console.log(`[detail]   -> steps >= threshold, exiting detail mode`);
            exitDetailMode();
        }
    }, 200);
}
