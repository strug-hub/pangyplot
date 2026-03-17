// Chain pop/unpop state machine: force population, junction activation.

import { state } from '../../../simplify-state.js';
import { clearForce, addPoppedNodes, removePoppedNodes } from '../force-engine.js';
import { getForceNodes } from '../../data/force-data.js';
import { deserializeChainGraph, absorbChainsPhantoms, restoreChainsPhantoms } from '../../data/polychain/polychain-adapter.js';
import { getActivationSet } from '../../../engines/physics-activation-engine.js';
import { clearFetchedRegion } from '../../data/polychain/polychain-fetcher.js';
import { resetSimplifyViewState } from '../../data/simplify-view-state.js';
import { recordPop, loadHistory } from '../../../../utils/pop-history.js';
import { navigateToHash } from '../../../engines/navigation/hash-navigation.js';
import { scheduleFrame } from '../../../utils/frame-scheduler.js';
import { popBubbleForceNode } from '../../data/bubble-pop-adapter.js';

// ---------------------------------------------------------------
// Clear detail state (called by detail-transition-engine on fade-out complete)
// ---------------------------------------------------------------
export function clearDetailState() {
    clearFetchedRegion();
    state.detailData = null;
    clearForce();
    state.activeSeedChainId = null;
    state.poppedChainIds.clear();
    resetSimplifyViewState();
    state._bubblePopStack = [];
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

    // Absorb phantoms: rewire junction links to anchors, remove phantom nodes
    absorbChainsPhantoms(chainId, getForceNodes());

    const stepInfo = chain.minStep != null && chain.maxStep != null
        ? `${chain.minStep}-${chain.maxStep}` : '';
    recordPop('chain-pop', { id: chainId, ...(stepInfo && { steps: stepInfo }) });

    return true;
}

/**
 * Toggle pop/unpop for a chain. Called from Ctrl+click handler.
 */
export function togglePopChain(chain) {
    if (!chain || !state.detailData) return;

    if (state.poppedChainIds.has(chain.id)) {
        restoreChainsPhantoms(chain.id);
        removePoppedNodes(chain.id);
        state.poppedChainIds.delete(chain.id);
        if (state.activeSeedChainId === chain.id) {
            state.activeSeedChainId = null;
        }
    } else {
        const activation = getActivationSet();
        popChainById(chain.id, activation);
    }
}

// ---------------------------------------------------------------
// Step-range helpers for replay fallback
// ---------------------------------------------------------------

/**
 * Parse a connector chain ID like "c121:500-800" into components.
 * Returns { parentId, minStep, maxStep } or null for non-connector IDs.
 */
function parseStepRange(chainId) {
    const m = chainId.match(/^c(\d+):(\d+)-(\d+)$/);
    if (!m) return null;
    return { parentId: m[1], minStep: parseInt(m[2], 10), maxStep: parseInt(m[3], 10) };
}

/**
 * Find loaded chains whose step range overlaps [targetMin, targetMax]
 * and share the same parent chain ID.
 */
function findOverlappingChains(parentId, targetMin, targetMax) {
    if (!state.detailData) return [];
    const prefix = `c${parentId}:`;
    const parentFull = `c${parentId}`;
    const results = [];
    for (const chain of state.detailData.chains) {
        // Must match parent: either "c{parentId}:..." or exactly "c{parentId}"
        if (chain.id !== parentFull && !chain.id.startsWith(prefix)) continue;
        if (chain.minStep == null || chain.maxStep == null) continue;
        // Check overlap
        if (chain.minStep >= targetMax || chain.maxStep <= targetMin) continue;

        const span = chain.maxStep - chain.minStep;
        if (span <= 0) continue;
        const overlapMin = Math.max(chain.minStep, targetMin);
        const overlapMax = Math.min(chain.maxStep, targetMax);
        const tStart = (overlapMin - chain.minStep) / span;
        const tEnd = (overlapMax - chain.minStep) / span;
        results.push({ chain, tStart, tEnd });
    }
    return results;
}

/**
 * Pop all chains overlapping a target step range, with computed clip ranges.
 */
function popChainByStepRange(parentId, targetMin, targetMax) {
    const overlaps = findOverlappingChains(parentId, targetMin, targetMax);
    let count = 0;
    for (const { chain, tStart, tEnd } of overlaps) {
        if (state.poppedChainIds.has(chain.id)) continue;
        // Build a fake activation with the clip range
        const isFullCoverage = tStart < 0.01 && tEnd > 0.99;
        const clipRange = isFullCoverage ? null : { tStart, tEnd };
        const fakeActivation = clipRange
            ? { activated: new Map([[chain.id, clipRange]]) }
            : null;
        console.log(`Replay: step-range match → popping ${chain.id} (t=${tStart.toFixed(2)}-${tEnd.toFixed(2)})`);
        if (popChainById(chain.id, fakeActivation)) count++;
    }
    return count;
}

// ---------------------------------------------------------------
// Replay a saved pop history file
// ---------------------------------------------------------------
export async function replayHistory() {
    const ops = await loadHistory('simplify');
    if (!ops || ops.length === 0) {
        console.warn('No pop history to replay');
        return;
    }

    // Find detail-tiles entry for navigation target
    const tilesOp = ops.find(o => o.action === 'detail-tiles');
    if (!tilesOp) {
        console.warn('Pop history has no detail-tiles entry, cannot navigate');
        return;
    }

    const { chromosome, start, end } = tilesOp;
    console.log(`Replaying: navigating to ${chromosome}:${start}-${end}`);
    location.hash = `#${chromosome}:${start}-${end}`;
    navigateToHash();
    scheduleFrame();

    // Wait for detail data to load (poll every 100ms, 10s timeout)
    console.log('Waiting for detail data...');
    const loaded = await new Promise(resolve => {
        let elapsed = 0;
        const interval = setInterval(() => {
            elapsed += 100;
            if (state.detailData) {
                clearInterval(interval);
                resolve(true);
            } else if (elapsed >= 10000) {
                clearInterval(interval);
                resolve(false);
            }
        }, 100);
    });

    if (!loaded) {
        console.warn('Timed out waiting for detail data');
        return;
    }

    // Replay chain pops
    const chainOps = ops.filter(o => o.action === 'chain-pop');
    let chainCount = 0;
    for (const op of chainOps) {
        if (state.poppedChainIds.has(op.id)) continue;

        // Try exact match first
        if (popChainById(op.id, null)) {
            chainCount++;
            continue;
        }

        // Fallback: parse step range from ID or from recorded steps field
        let parsed = parseStepRange(op.id);
        if (!parsed && op.steps) {
            // ID might be a plain chain ID with steps recorded separately
            const sm = op.steps.match(/^(\d+)-(\d+)$/);
            const im = op.id.match(/^c(\d+)$/);
            if (sm && im) {
                parsed = { parentId: im[1], minStep: parseInt(sm[1], 10), maxStep: parseInt(sm[2], 10) };
            }
        }

        if (parsed) {
            console.log(`Replay: ${op.id} not found, matching by steps ${parsed.minStep}-${parsed.maxStep}`);
            chainCount += popChainByStepRange(parsed.parentId, parsed.minStep, parsed.maxStep);
        } else {
            console.warn(`Replay: chain ${op.id} not found, skipping`);
        }
    }

    // Replay bubble pops sequentially (async fetch)
    const bubbleOps = ops.filter(o => o.action === 'bubble-pop');
    let bubbleCount = 0;
    for (const op of bubbleOps) {
        const node = getForceNodes().find(n => n.id === op.id);
        if (!node) {
            console.warn(`Replay: bubble node ${op.id} not found, skipping`);
            continue;
        }
        await popBubbleForceNode(node);
        bubbleCount++;
    }

    console.log(`Replayed ${chainCount} chain-pops, ${bubbleCount} bubble-pops`);
}
