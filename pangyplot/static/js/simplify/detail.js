// Progressive detail: single-viewport fetch, fade animation, phase state machine.
//
// Fetches chain polylines from /detail-tiles for the whole visible region at once.
// No bubble popping or force simulation — chains are drawn as static polylines.

import { state } from './simplify-state.js';
import { xToBp, getChromosome, isReady } from './spine.js';
import { getViewport } from './viewport.js';
import { scheduleFrame, updateDetailBar } from './render.js';
import { selectLevel } from './lod.js';
import { clearForce, addPoppedNodes, removePoppedNodes, addInterChainLinks, removeInterChainLinks, getForceNodes } from './simplify-force.js';
import { deserializeChainGraph, deserializeJunctionSegments, createJunctionToAnchorLinks, createInterChainLinks } from './simplify-detail-adapter.js';
import { getActivationSet } from './physics-zone.js';

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
        junctionGraph: apiResponse.junction_graph || { nodes: [], links: [] },
        junctionSegChains: apiResponse.junction_seg_chains || {},
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
    clearForce();
    state.activeSeedChainId = null;
    state.poppedChainIds.clear();
    state.activatedJunctionSegs.clear();
}

// ---------------------------------------------------------------
// Populate force simulation with the seed chain's graph data
// ---------------------------------------------------------------
function populateSeedForce() {
    clearForce();
    state.activeSeedChainId = null;
    state.poppedChainIds.clear();
    state.activatedJunctionSegs.clear();

    const activation = getActivationSet();
    if (!activation) return;

    const seedId = activation.seed;
    popChainById(seedId, activation);
    if (state.poppedChainIds.has(seedId)) {
        state.activeSeedChainId = seedId;
    }
}

/**
 * Pop a single chain into the force simulation by its ID.
 * Returns true if the chain was successfully popped.
 */
function popChainById(chainId, activation) {
    if (!state.detailData) return false;
    const chain = state.detailData.chains.find(c => c.id === chainId);
    if (!chain || !chain.graph) return false;

    let clipRange = null;
    if (activation) {
        const clipInfo = activation.activated.get(chainId);
        if (clipInfo && (clipInfo.tStart > 0 || clipInfo.tEnd < 1)) {
            clipRange = { tStart: clipInfo.tStart, tEnd: clipInfo.tEnd };
        }
    }

    const { nodes, links } = deserializeChainGraph(chain.graph, chain, clipRange);
    if (nodes.length === 0) return false;

    addPoppedNodes(nodes, links);
    state.poppedChainIds.add(chainId);

    // Activate adjacent junction segments
    activateJunctionSegs(chainId, nodes);

    // Create inter-chain links to already-popped adjacent chains
    createInterChainLinksForPopped();

    return true;
}

/**
 * Create inter-chain links between popped chains and their neighbors
 * using sibling connector coordinates.  When only one side is popped,
 * a pinned phantom node is placed at the static chain's endpoint.
 * Removes existing inter-chain phantom nodes and links first, then rebuilds.
 */
function createInterChainLinksForPopped() {
    const dd = state.detailData;
    if (!dd || state.poppedChainIds.size === 0) return;

    // Remove existing inter-chain phantom nodes and links
    removePoppedNodes('__interchain__');
    removeInterChainLinks();

    const { nodes, links } = createInterChainLinks(
        dd.siblingConnectors, state.poppedChainIds, dd.chains, getForceNodes());
    if (links.length > 0) {
        // Phantom nodes get added to the sim; links between existing anchors
        // go via addInterChainLinks (link-only, no new nodes)
        if (nodes.length > 0) {
            // Gather links that involve at least one phantom
            const phantomLinks = links.filter(l => l.source?.isPhantom || l.target?.isPhantom);
            addPoppedNodes(nodes, phantomLinks);
        }
        const anchorLinks = links.filter(l => !l.source?.isPhantom && !l.target?.isPhantom);
        if (anchorLinks.length > 0) addInterChainLinks(anchorLinks);
    }
}

/**
 * Activate junction segments adjacent to a popped chain.
 * Creates force nodes for junction segs and links connecting them
 * to the chain's anchor nodes.
 */
function activateJunctionSegs(chainId, chainForceNodes) {
    const dd = state.detailData;
    if (!dd || !dd.junctionGraph || !dd.junctionSegChains) return;

    // Find junction seg IDs adjacent to this chain
    const segsToActivate = [];
    const segsAlreadyActive = [];
    for (const [segId, chainIds] of Object.entries(dd.junctionSegChains)) {
        if (chainIds.includes(chainId)) {
            if (!state.activatedJunctionSegs.has(segId)) {
                segsToActivate.push(segId);
            } else {
                state.activatedJunctionSegs.get(segId).add(chainId);
                segsAlreadyActive.push(segId);
            }
        }
    }

    // For already-active junction segs, create additional anchor links
    // connecting them to the newly popped chain's anchors.
    // Build recordMap from existing sim nodes (not re-deserialized) so
    // link elements reference the correct kink nodes already in the sim.
    if (segsAlreadyActive.length > 0) {
        const activeSegSet = new Set(segsAlreadyActive);
        const existingMap = new Map();
        for (const node of getForceNodes()) {
            if (node.chainId !== 'junction') continue;
            const rid = node.recordId || node.id;
            if (!activeSegSet.has(rid) || existingMap.has(rid)) continue;
            if (node.record) existingMap.set(rid, node.record);
        }
        if (existingMap.size > 0) {
            const poppedChains = dd.chains.filter(c => state.poppedChainIds.has(c.id));
            const newAnchorLinks = createJunctionToAnchorLinks(
                existingMap, getForceNodes(), dd.junctionGraph, poppedChains);
            if (newAnchorLinks.length > 0) {
                addInterChainLinks(newAnchorLinks);
            }
        }
    }

    if (segsToActivate.length === 0) return;

    // Deserialize junction segments into force nodes/links
    const { nodes, links, recordMap } = deserializeJunctionSegments(
        dd.junctionGraph, segsToActivate);
    if (nodes.length === 0) return;

    // Create links from junction nodes to chain anchor nodes
    const poppedChains = dd.chains.filter(c => state.poppedChainIds.has(c.id));
    const anchorLinks = createJunctionToAnchorLinks(
        recordMap, getForceNodes(), dd.junctionGraph, poppedChains);

    // Add to simulation
    addPoppedNodes(nodes, [...links, ...anchorLinks]);

    // Record activation with refcount
    for (const segId of segsToActivate) {
        const refSet = new Set([chainId]);
        state.activatedJunctionSegs.set(segId, refSet);
    }
}

/**
 * Deactivate junction segments when a chain is unpopped.
 * Only removes segs whose refcount drops to 0.
 */
function deactivateJunctionSegs(chainId) {
    const dd = state.detailData;
    if (!dd || !dd.junctionSegChains) return;

    const segsToRemove = [];
    for (const [segId, chainIds] of Object.entries(dd.junctionSegChains)) {
        if (!chainIds.includes(chainId)) continue;
        const refSet = state.activatedJunctionSegs.get(segId);
        if (!refSet) continue;

        refSet.delete(chainId);
        if (refSet.size === 0) {
            segsToRemove.push(segId);
            state.activatedJunctionSegs.delete(segId);
        }
    }

    // Remove force nodes for deactivated segs
    if (segsToRemove.length > 0) {
        removePoppedNodes('junction');
        // Re-add any still-activated junction segs
        readdActiveJunctions();
    }
}

/**
 * Re-add all currently activated junction segments to the simulation.
 * Called after a bulk removal of junction nodes.
 */
function readdActiveJunctions() {
    if (state.activatedJunctionSegs.size === 0) return;
    const dd = state.detailData;
    if (!dd) return;

    const activeSegIds = [...state.activatedJunctionSegs.keys()];
    const { nodes, links, recordMap } = deserializeJunctionSegments(
        dd.junctionGraph, activeSegIds);
    if (nodes.length === 0) return;

    // Rebuild anchor links to all currently popped chains
    const poppedChains = dd.chains.filter(c => state.poppedChainIds.has(c.id));
    const anchorLinks = createJunctionToAnchorLinks(
        recordMap, getForceNodes(), dd.junctionGraph, poppedChains);

    addPoppedNodes(nodes, [...links, ...anchorLinks]);
}

/**
 * Toggle pop/unpop for a chain. Called from X key handler.
 * If the chain has no graph data, this is a no-op.
 */
export function togglePopChain(chain) {
    if (!chain || !state.detailData) return;

    if (state.poppedChainIds.has(chain.id)) {
        // Unpop: remove from simulation
        deactivateJunctionSegs(chain.id);
        removePoppedNodes(chain.id);
        state.poppedChainIds.delete(chain.id);
        if (state.activeSeedChainId === chain.id) {
            state.activeSeedChainId = null;
        }
        // Rebuild inter-chain links (this chain's links need removing)
        createInterChainLinksForPopped();
    } else {
        // Pop: add to simulation
        const activation = getActivationSet();
        popChainById(chain.id, activation);
    }
}

// ---------------------------------------------------------------
// Detail phase state machine
// ---------------------------------------------------------------
export function setDetailPhase(phase) {
    state.detailPhase = phase;
    const cls = (phase === 'fading-in' || phase === 'fading-out') ? 'fading' : phase;
    state.dom.detailPhase.className = cls;
    // Always show "DETAILS" text; append opacity when active
    if (phase === 'none') {
        state.dom.detailPhase.textContent = 'DETAILS';
    } else {
        state.dom.detailPhase.textContent = `DETAILS ${state.detailOpacity.toFixed(2)}`;
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
    state.dom.detailPhase.textContent = `DETAILS ${state.detailOpacity.toFixed(2)}`;
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
    state.dom.detailPhase.className = 'fetching';
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
        // Restore phase class after fetch (fetching class was temporary)
        const cls = (state.detailPhase === 'fading-in' || state.detailPhase === 'fading-out') ? 'fading' : state.detailPhase;
        state.dom.detailPhase.className = cls;
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
