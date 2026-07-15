/**
 * pop-handler.js — SimObject-based bubble pop for the viewer.
 *
 * Container splits, child SimObjects created, GFA links resolved.
 * Only ends are registered. Interior segs are invisible to the link system.
 */

import { state } from '../../state.js';
import { insertPoppedContent, removePoppedContent } from '../engines/force-engine.js';
import { getForceLinks } from '../data/force-data.js';

import { register as registerSeg, resolve as resolveObj, resolveForLink } from './segment-registry.js';

import { getContainer, addObject, removeObject } from './model-manager.js';
import { getGenePins } from '@graph-data/gene-data.js';
import { SegmentObject } from './segment-object.js';
import { BubbleObject } from './bubble-object.js';
import { getBubbleStore } from '../data/bubble-meta-cache.js';
import popTree from '../data/pop-tree.js';
import { reResolve as reResolvePath } from '../../engines/path-trace/path-trace-engine.js';

/**
 * Pop a bubble circle on a polychain.
 * Splits the chain visually — no child nodes yet.
 */
export async function popBubbleCircleV2(hit) {
    if (!hit || !hit.meta) return false;

    const bubbleId = hit.meta.id;
    const chainId = hit.chainId;
    const chr = state.chromosome;
    if (!chr) return false;

    const container = getContainer(chainId);
    if (!container || container.spineNodes.length < 2) return false;

    // Use the container's canonical t for this bubble — metaStore t may differ
    // from the container's t, causing segment range gaps on subsequent pops.
    const containerBubble = container.bubbles.find(b => b.id === bubbleId);
    const t = containerBubble ? containerBubble.t : hit.meta.t;

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
    const splitResult = container.splitAtBubble(bubbleId, t, sourceSegs, sinkSegs);
    const { leftSegment, rightSegment, removedSegment, newAnchors } = splitResult;

    // New inner anchors collected — will be added to sim in one batch at the end.

    // --- Register segment ends in seg-registry (SimObjects, not raw nodes) ---
    if (leftSegment) {
        for (const segId of leftSegment.ends.head) registerSeg(segId, leftSegment);
        for (const segId of leftSegment.ends.tail) registerSeg(segId, leftSegment);
    }
    if (rightSegment) {
        for (const segId of rightSegment.ends.head) registerSeg(segId, rightSegment);
        for (const segId of rightSegment.ends.tail) registerSeg(segId, rightSegment);
    }

    // --- Update model store ---
    removeObject(removedSegment.id);
    if (leftSegment) addObject(leftSegment);
    if (rightSegment) addObject(rightSegment);

    // --- Materialize boundary segs where a side is empty ---
    const materializedObjects = [];
    const destroyedLinkMeta = [];  // link metadata from removed anchors (for undo)
    const deferredNodes = [];      // collect all nodes for batch add
    const deferredLinks = [];      // collect all links for batch add
    // When a split side has no bubbles, the boundary seg becomes a real
    // SegmentObject replacing the anchor. Remove old anchor + its links,
    // the new kink node takes over in the registry.
    const { materializeHead, materializeTail } = splitResult;
    const materializedSegIds = new Set([...materializeHead, ...materializeTail]);

    for (const segId of materializedSegIds) {
        // Find the API node for this boundary seg
        const apiNode = (apiData.nodes || []).find(n => String(n.id) === segId);
        if (!apiNode) continue;

        const obj = SegmentObject.fromApiNode(apiNode, chainId);
        addObject(obj);
        materializedObjects.push(obj);

        // Register SimObject ends (overwrites old anchor registration)
        for (const sid of obj.ends.head) registerSeg(sid, obj);
        for (const sid of obj.ends.tail) registerSeg(sid, obj);

        // Save link metadata from the old anchor before removing it.
        // These links will need to be recreated on undo (pointing to the restored anchor).
        const oldAnchor = materializeHead.includes(segId)
            ? removedSegment.headAnchor
            : removedSegment.tailAnchor;
        if (oldAnchor) {
            const anchorIid = oldAnchor.iid;
            for (const l of getForceLinks()) {
                const sIid = l.source?.iid ?? l.source;
                const tIid = l.target?.iid ?? l.target;
                if (sIid === anchorIid || tIid === anchorIid) {
                    destroyedLinkMeta.push({
                        sourceId: l.sourceId, targetId: l.targetId,
                        fromStrand: l.fromStrand || '+', toStrand: l.toStrand || '+',
                        chainId: l.chainId, isDel: l.isDel,
                        length: l.length, width: l.width,
                        contained: l.contained, frequency: l.frequency,
                    });
                }
            }
            removePoppedContent([anchorIid]);
        }

        // Collect for batch add (deferred to single insertPoppedContent call)
        deferredNodes.push(...obj.physicsNodes);
        deferredLinks.push(...obj.physicsLinks);

        // Spawn at anchor's live position, pull toward ODGI layout
        const anchorPos = oldAnchor
            ? { x: oldAnchor.x, y: oldAnchor.y }
            : container.positionAt(t);
        for (const n of obj.physicsNodes) {
            n.chainId = chainId;
            n.popBubbleId = bubbleId;
            n.guideChainId = chainId;
            n.x = anchorPos.x;
            n.y = anchorPos.y;
            // homeX/homeY stays as ODGI coords (set during kink creation)
        }
    }

    // --- Step 3: Create child SimObjects ---
    const boundaryIds = new Set([...sourceSegs, ...sinkSegs]);

    // Filter out boundary seg nodes — anchors or materialized objects handle them
    const interiorApiNodes = (apiData.nodes || []).filter(n =>
        !boundaryIds.has(String(n.id)));

    const childObjects = [];
    for (const node of interiorApiNodes) {
        let obj;
        if (node.type === 'segment') {
            obj = SegmentObject.fromApiNode(node, chainId);
        } else if (node.type === 'bubble') {
            obj = BubbleObject.fromApiNode(node, chainId);
        }
        if (obj) {
            childObjects.push(obj);
            addObject(obj);
        }
    }

    // Track pop-created objects on the container for lifecycle cleanup
    for (const obj of childObjects) container.popChildren.add(obj);
    for (const obj of materializedObjects) container.popChildren.add(obj);

    // Register each object's ends in seg-registry (SimObjects, not raw nodes)
    for (const obj of childObjects) {
        for (const segId of obj.ends.head) registerSeg(segId, obj);
        for (const segId of obj.ends.tail) registerSeg(segId, obj);
    }

    // Compute gene overlaps for all new objects (split segments + children + materialized)
    const genePins = getGenePins();
    if (leftSegment) leftSegment.computeGeneOverlaps(genePins);
    if (rightSegment) rightSegment.computeGeneOverlaps(genePins);
    for (const obj of childObjects) obj.computeGeneOverlaps(genePins);
    for (const obj of materializedObjects) obj.computeGeneOverlaps(genePins);

    // Detect indel objects: any child with a GFA link from head to tail
    // gets a synthetic deletion link (kink#0 → kink#last) for the X marker.
    const indelMarked = new Set();
    for (const rawLink of (apiData.links || [])) {
        const sId = String(rawLink.source).startsWith('s')
            ? String(rawLink.source) : `s${rawLink.source}`;
        const tId = String(rawLink.target).startsWith('s')
            ? String(rawLink.target) : `s${rawLink.target}`;
        for (const obj of childObjects) {
            if (indelMarked.has(obj)) continue;
            const sInHead = obj.ends.head.includes(sId);
            const sInTail = obj.ends.tail.includes(sId);
            const tInHead = obj.ends.head.includes(tId);
            const tInTail = obj.ends.tail.includes(tId);
            if ((sInHead && tInTail) || (sInTail && tInHead)) {
                if (obj.physicsNodes.length >= 3) {
                    const headIid = `${obj.id}#0`;
                    const tailIid = `${obj.id}#${obj.physicsNodes.length - 1}`;
                    obj.physicsLinks.push({
                        isNode: false, isLink: true, class: 'link',
                        iid: `del_${obj.id}`,
                        source: headIid, target: tailIid,
                        sourceIid: headIid, targetIid: tailIid,
                        sourceId: obj.id, targetId: obj.id,
                        type: 'link', chainId,
                        isDel: true,
                        isKinkLink: false, isRef: false, isDrawn: true,
                        length: 20, width: 1,
                    });
                }
                indelMarked.add(obj);
            }
        }
    }

    // Collect kink nodes + kink links from child objects (after indel marking)
    const childNodes = [];
    const childKinkLinks = [];
    for (const obj of childObjects) {
        childNodes.push(...obj.physicsNodes);
        childKinkLinks.push(...obj.physicsLinks);
    }

    // --- Resolve GFA links ---
    // Both endpoints must be registered ends. The SimObject resolves
    // the correct d3 node (strand-aware for kinked segments).

    // Build multi-map: segId → all SimObjects that claim it as an end.
    // Registry is last-write-wins, so shared segs between siblings lose
    // one registration. This map preserves all claims for isDel detection.
    const segToObjects = new Map();
    for (const obj of childObjects) {
        for (const s of obj.ends.head) {
            if (!segToObjects.has(s)) segToObjects.set(s, []);
            segToObjects.get(s).push(obj);
        }
        for (const s of obj.ends.tail) {
            if (!segToObjects.has(s)) segToObjects.set(s, []);
            segToObjects.get(s).push(obj);
        }
    }

    function _isDeletionLink(fromSeg, toSeg) {
        const fromObjs = segToObjects.get(fromSeg);
        const toObjs = segToObjects.get(toSeg);
        if (!fromObjs || !toObjs) return false;
        for (const obj of fromObjs) {
            if (!toObjs.includes(obj)) continue;
            const fromInHead = obj.ends.head.includes(fromSeg);
            const fromInTail = obj.ends.tail.includes(fromSeg);
            const toInHead = obj.ends.head.includes(toSeg);
            const toInTail = obj.ends.tail.includes(toSeg);
            if ((fromInHead && toInTail) || (fromInTail && toInHead)) return true;
        }
        return false;
    }

    const gfaLinks = [];
    for (const rawLink of (apiData.links || [])) {
        const fromSegId = String(rawLink.source).startsWith('s')
            ? String(rawLink.source) : `s${rawLink.source}`;
        const toSegId = String(rawLink.target).startsWith('s')
            ? String(rawLink.target) : `s${rawLink.target}`;

        // Build link-like object for resolveEnd
        const linkForResolve = {
            source: fromSegId, target: toSegId,
            fromStrand: rawLink.from_strand || '+',
            toStrand: rawLink.to_strand || '+',
        };

        const fromNode = resolveForLink(linkForResolve, fromSegId);
        const toNode = resolveForLink(linkForResolve, toSegId);
        if (!fromNode?.iid || !toNode?.iid) continue;

        const linkLen = (rawLink.length || 0) > 0
            ? Math.min(rawLink.length / 100, 1000) : 10;
        gfaLinks.push({
            isNode: false, isLink: true, class: 'link',
            iid: `${fromNode.iid}${rawLink.from_strand || '+'}${toNode.iid}${rawLink.to_strand || '+'}`,
            source: fromNode.iid, target: toNode.iid,
            sourceIid: fromNode.iid, targetIid: toNode.iid,
            sourceId: fromSegId, targetId: toSegId,
            type: 'link',
            chainId,
            isDel: _isDeletionLink(fromSegId, toSegId),
            isKinkLink: false, isRef: false, isDrawn: true,
            length: linkLen, width: 1,
            contained: rawLink.contained || [],
            frequency: rawLink.frequency || 0,
        });
    }

    // --- Position: spawn at bubble circle, pull toward ODGI layout ---
    if (childNodes.length > 0) {
        const bubblePos = container.positionAt(t);
        let cx = 0, cy = 0;
        for (const n of childNodes) { cx += n.x; cy += n.y; }
        cx /= childNodes.length; cy /= childNodes.length;
        const squish = 0.15;
        for (const n of childNodes) {
            n.homeX = n.x; n.homeY = n.y;  // ODGI layout (for layout force pull)
            n.x = bubblePos.x + (n.homeX - cx) * squish;  // spawn position
            n.y = bubblePos.y + (n.homeY - cy) * squish;
        }
    }

    // Tag child nodes for forces (before adding to sim)
    for (const n of childNodes) {
        n.chainId = chainId;
        n.popBubbleId = bubbleId;
        n.guideChainId = chainId;
    }

    // --- Add everything to D3 sim in one batch ---
    // All nodes + links at once to avoid mid-tick iid resolution errors.
    const allNewNodes = [...newAnchors, ...deferredNodes, ...childNodes];
    const allNewLinks = [...deferredLinks, ...childKinkLinks, ...gfaLinks];
    if (allNewNodes.length > 0 || allNewLinks.length > 0) {
        insertPoppedContent(chainId, allNewNodes, allNewLinks);
    }

    // --- Save undo data: actual objects, not just IDs ---
    // Collect anchors that were removed during materialization
    const removedAnchors = [];
    for (const segId of materializedSegIds) {
        const anchor = materializeHead.includes(segId)
            ? removedSegment.headAnchor
            : removedSegment.tailAnchor;
        if (anchor) removedAnchors.push(anchor);
    }

    popTree.register(bubbleId, chainId, null, {
        bubbleId,
        chainId,
        // Removed from sim — restore on undo
        removedSegment,
        removedAnchors,
        destroyedLinkMeta,     // link metadata to recreate on undo

        // Added to sim — remove on undo
        addedNodes: [
            ...newAnchors,
            ...childNodes,
            ...materializedObjects.flatMap(o => o.physicsNodes),
        ],
        addedObjects: [
            ...(leftSegment ? [leftSegment] : []),
            ...(rightSegment ? [rightSegment] : []),
            ...childObjects,
            ...materializedObjects,
        ],
    });


    reResolvePath();
    return true;
}

/**
 * Pop all bubble circles on a chain sequentially.
 */
/**
 * Pop all bubbles within the highlighted (shift+drag selected) ranges.
 */
export async function popHighlightedBubbles() {
    for (const [chain, { tStart, tEnd }] of state.selectedChains) {
        const container = getContainer(chain.id);
        if (!container || container.bubbles.length === 0) continue;
        const metaStore = getBubbleStore(chain.id);

        let unpopped;
        while ((unpopped = container.bubblesInRange(tStart, tEnd)).length > 0) {
            const bubble = unpopped[0];
            const pos = container.positionAt(bubble.t);
            let meta = null;
            if (metaStore?.bubbles) {
                meta = metaStore.bubbles.find(b => b.id === bubble.id)
                    || metaStore.bubbles.find(b => Math.abs(b.t - bubble.t) < 0.001);
            }
            const hitMeta = meta
                ? { ...meta, id: bubble.id, t: bubble.t }
                : { id: bubble.id, t: bubble.t };
            const hit = { x: pos.x, y: pos.y, meta: hitMeta, chainId: chain.id };
            await popBubbleCircleV2(hit);
        }
    }
}

export async function popAllBubblesOnChain(chainId) {
    const container = getContainer(chainId);
    if (!container || container.bubbles.length === 0) return;

    const metaStore = getBubbleStore(chainId);

    // Walk unpopped bubbles — bubblesInRange excludes already-popped ranges.
    // Re-query each iteration since popping changes the ranges.
    let unpopped;
    while ((unpopped = container.bubblesInRange(0, 1)).length > 0) {
        const bubble = unpopped[0];
        const pos = container.positionAt(bubble.t);
        let meta = null;
        if (metaStore?.bubbles) {
            meta = metaStore.bubbles.find(b => b.id === bubble.id)
                || metaStore.bubbles.find(b => Math.abs(b.t - bubble.t) < 0.001);
        }

        // Always use the container bubble's id/t as canonical — metaStore values may differ
        const hitMeta = meta
            ? { ...meta, id: bubble.id, t: bubble.t }
            : { id: bubble.id, t: bubble.t };
        const hit = { x: pos.x, y: pos.y, meta: hitMeta, chainId };
        await popBubbleCircleV2(hit);
    }
}