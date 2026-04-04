/**
 * pop-handler.js — SimObject-based bubble pop for the simplify viewer.
 *
 * Step 2: Destructive chain split only.
 * Container splits, segments get created/destroyed, anchors swap in sim.
 * Child nodes and GFA link resolution come in step 3.
 */

import { state } from '../../simplify-state.js';
import { insertPoppedContent, removePoppedContent } from '../engines/force-engine.js';
import { getForceNodes } from '../data/force-data.js';
import { getPolychainNodesForChain } from '../data/polychain/polychain-adapter.js';
import { registerSeg } from '../data/seg-registry.js';

import { getContainer, addObject, removeObject } from './model-manager.js';
import { markDeletionLinks } from './polychain-factory.js';

/**
 * Pop a bubble circle on a polychain.
 * Splits the chain visually — no child nodes yet.
 */
export async function popBubbleCircleV2(hit) {
    if (!hit || !hit.meta) return false;

    const bubbleId = hit.meta.id;
    const chainId = hit.chainId;
    const t = hit.meta.t;
    const chr = state.chromosome;
    if (!chr) return false;

    const pcNodes = getPolychainNodesForChain(chainId);
    if (!pcNodes || pcNodes.length < 2) return false;

    // --- Fetch /pop (need source_segs and sink_segs for anchor registration) ---
    const url = `/pop?id=${encodeURIComponent(bubbleId)}`
        + `&genome=${encodeURIComponent(state.GENOME)}`
        + `&chromosome=${encodeURIComponent(chr)}`;

    let apiData;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        apiData = await resp.json();
    } catch (e) {
        console.warn('[pop-handler] fetch failed:', e);
        return false;
    }

    const sourceSegs = (apiData.source_segs || []).map(s => `s${s}`);
    const sinkSegs = (apiData.sink_segs || []).map(s => `s${s}`);

    // --- Split container ---
    const container = getContainer(chainId);
    if (!container) {
        console.warn(`[pop-handler] No container for chain ${chainId}`);
        return false;
    }

    const splitResult = container.splitAtBubble(bubbleId, t, sourceSegs, sinkSegs);
    const { leftSegment, rightSegment, removedSegment } = splitResult;

    // --- Swap anchors in D3 sim ---
    // Remove old segment's anchors
    const removeIids = removedSegment.physicsNodes.map(n => n.iid);
    // Collect old anchor iids that are actually in the sim
    const existingIids = new Set(getForceNodes().map(n => n.iid));
    const iidsToRemove = removeIids.filter(iid => existingIids.has(iid));
    if (iidsToRemove.length > 0) {
        removePoppedContent(iidsToRemove);
    }

    // Add new segments' anchors to sim
    const newAnchors = [];
    if (leftSegment) newAnchors.push(...leftSegment.physicsNodes);
    if (rightSegment) newAnchors.push(...rightSegment.physicsNodes);

    if (newAnchors.length > 0) {
        insertPoppedContent(chainId, newAnchors, []);
    }

    // --- Register anchor segs in old seg-registry ---
    if (leftSegment) {
        for (const segId of leftSegment.ends.head) registerSeg(segId, leftSegment.headAnchor);
        for (const segId of leftSegment.ends.tail) registerSeg(segId, leftSegment.tailAnchor);
    }
    if (rightSegment) {
        for (const segId of rightSegment.ends.head) registerSeg(segId, rightSegment.headAnchor);
        for (const segId of rightSegment.ends.tail) registerSeg(segId, rightSegment.tailAnchor);
    }

    // --- Update model store ---
    removeObject(removedSegment.id);
    if (leftSegment) addObject(leftSegment);
    if (rightSegment) addObject(rightSegment);

    console.log(`[pop-handler] split ${bubbleId} on ${chainId}: ` +
        `left=${!!leftSegment} right=${!!rightSegment}, ` +
        `segments=${container.segments.length}, anchors=${newAnchors.length}`);

    return true;
}

/**
 * Pop a bubble force node (placeholder — not yet reimplemented).
 */
export async function popBubbleForceNodeV2(bubbleNode) {
    console.warn('[pop-handler] popBubbleForceNodeV2 not yet reimplemented');
    return false;
}
