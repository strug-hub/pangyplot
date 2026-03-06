// Chain pop/unpop state machine: fade animation, phase transitions, force population.

import { state } from '../../simplify-state.js';
import { scheduleFrame } from '../../render-manager.js';
import { updateDetailBar, updateDetailPhase, updateDetailOpacityReadout } from '../../ui/status-bar.js';
import { clearForce, addPoppedNodes, removePoppedNodes, addInterChainLinks, removeInterChainLinks, getForceNodes } from '../data/force-sim.js';
import { deserializeChainGraph, deserializeJunctionSegments, createJunctionToAnchorLinks, createInterChainLinks } from '../../detail/data/detail-adapter.js';
import { getActivationSet } from '../../physics-zone.js';
import { clearFetchedRegion, getFadeStartTime, setFadeStartTime, doScheduleDetailFetch } from '../../detail/data/detail-fetcher.js';

// ---------------------------------------------------------------
// Re-export: debounced detail fetch trigger
// ---------------------------------------------------------------
export function scheduleDetailFetch() {
    doScheduleDetailFetch();
}

// ---------------------------------------------------------------
// Clear detail state
// ---------------------------------------------------------------
function clearDetailState() {
    clearFetchedRegion();
    state.detailData = null;
    clearForce();
    state.activeSeedChainId = null;
    state.poppedChainIds.clear();
    state.activatedJunctionSegs.clear();
}

// ---------------------------------------------------------------
// Populate force simulation with the seed chain's graph data
// ---------------------------------------------------------------
export function populateSeedForce() {
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

    activateJunctionSegs(chainId, nodes);
    createInterChainLinksForPopped();

    return true;
}

/**
 * Create inter-chain links between popped chains and their neighbors.
 */
function createInterChainLinksForPopped() {
    const dd = state.detailData;
    if (!dd || state.poppedChainIds.size === 0) return;

    removePoppedNodes('__interchain__');
    removeInterChainLinks();

    const { nodes, links } = createInterChainLinks(
        dd.siblingConnectors, state.poppedChainIds, dd.chains, getForceNodes());
    if (links.length > 0) {
        if (nodes.length > 0) {
            const phantomLinks = links.filter(l => l.source?.isPhantom || l.target?.isPhantom);
            addPoppedNodes(nodes, phantomLinks);
        }
        const anchorLinks = links.filter(l => !l.source?.isPhantom && !l.target?.isPhantom);
        if (anchorLinks.length > 0) addInterChainLinks(anchorLinks);
    }
}

/**
 * Activate junction segments adjacent to a popped chain.
 */
function activateJunctionSegs(chainId, chainForceNodes) {
    const dd = state.detailData;
    if (!dd || !dd.junctionGraph || !dd.junctionSegChains) return;

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

    const { nodes, links, recordMap } = deserializeJunctionSegments(
        dd.junctionGraph, segsToActivate);
    if (nodes.length === 0) return;

    const poppedChains = dd.chains.filter(c => state.poppedChainIds.has(c.id));
    const anchorLinks = createJunctionToAnchorLinks(
        recordMap, getForceNodes(), dd.junctionGraph, poppedChains);

    addPoppedNodes(nodes, [...links, ...anchorLinks]);

    for (const segId of segsToActivate) {
        const refSet = new Set([chainId]);
        state.activatedJunctionSegs.set(segId, refSet);
    }
}

/**
 * Deactivate junction segments when a chain is unpopped.
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

    if (segsToRemove.length > 0) {
        removePoppedNodes('junction');
        readdActiveJunctions();
    }
}

function readdActiveJunctions() {
    if (state.activatedJunctionSegs.size === 0) return;
    const dd = state.detailData;
    if (!dd) return;

    const activeSegIds = [...state.activatedJunctionSegs.keys()];
    const { nodes, links, recordMap } = deserializeJunctionSegments(
        dd.junctionGraph, activeSegIds);
    if (nodes.length === 0) return;

    const poppedChains = dd.chains.filter(c => state.poppedChainIds.has(c.id));
    const anchorLinks = createJunctionToAnchorLinks(
        recordMap, getForceNodes(), dd.junctionGraph, poppedChains);

    addPoppedNodes(nodes, [...links, ...anchorLinks]);
}

/**
 * Toggle pop/unpop for a chain. Called from Ctrl+click handler.
 */
export function togglePopChain(chain) {
    if (!chain || !state.detailData) return;

    if (state.poppedChainIds.has(chain.id)) {
        deactivateJunctionSegs(chain.id);
        removePoppedNodes(chain.id);
        state.poppedChainIds.delete(chain.id);
        if (state.activeSeedChainId === chain.id) {
            state.activeSeedChainId = null;
        }
        createInterChainLinksForPopped();
    } else {
        const activation = getActivationSet();
        popChainById(chain.id, activation);
    }
}

// ---------------------------------------------------------------
// Detail phase state machine
// ---------------------------------------------------------------
export function setDetailPhase(phase) {
    state.detailPhase = phase;
    updateDetailPhase();
    if (phase !== 'none') updateDetailBar();
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
    setFadeStartTime(performance.now());
    setDetailPhase('fading-out');
    scheduleFadeFrame();
}

export function updateDetailOpacity() {
    const now = performance.now();
    const elapsed = now - getFadeStartTime();
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
    updateDetailOpacityReadout();
}

export function scheduleFadeFrame() {
    requestAnimationFrame(() => {
        if (state.detailPhase === 'fading-in' || state.detailPhase === 'fading-out') {
            updateDetailOpacity();
            scheduleFrame();
        }
    });
}
