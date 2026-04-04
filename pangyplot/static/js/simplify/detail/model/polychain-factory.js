/**
 * Factory functions for creating SimObjects from API responses.
 *
 * These bridge the backend data format to the new SimObject model.
 * Can run alongside the old polychain-adapter / bubble-pop-adapter
 * during incremental migration.
 */

import { PolychainContainer } from './polychain-container.js';
import { SegmentObject } from './segment-object.js';
import { BubbleObject } from './bubble-object.js';
import * as registry from './segment-registry.js';

// --- Factory: detail-tiles chain → PolychainContainer ---

/**
 * Create a PolychainContainer from a /detail-tiles chain object.
 * Delegates to PolychainContainer.fromChainData() — the container
 * creates its own spine nodes + links internally.
 */
export function createContainerFromChain(chain) {
    return PolychainContainer.fromChainData(chain);
}

// --- Factory: /pop response → child SimObjects ---

/**
 * Create SimObjects from a /pop API response.
 *
 * @param {object} apiData — response from /pop endpoint
 * @param {string} parentChainId — chain the popped bubble belonged to
 * @param {{ x: number, y: number }} spawnPos — position to cluster children at
 * @returns {{ segments: SegmentObject[], bubbles: BubbleObject[] }}
 */
export function createObjectsFromPop(apiData, parentChainId, spawnPos) {
    const sourceSet = new Set((apiData.source_segs || []).map(s => `s${s}`));
    const sinkSet = new Set((apiData.sink_segs || []).map(s => `s${s}`));

    // Separate API nodes into segments and bubbles, skip boundary segs
    const boundaryIds = new Set([...sourceSet, ...sinkSet]);
    const segments = [];
    const bubbles = [];

    for (const node of (apiData.nodes || [])) {
        const nodeId = String(node.id);
        if (boundaryIds.has(nodeId)) continue; // anchors represent boundary segs

        if (node.type === 'segment') {
            const obj = SegmentObject.fromApiNode(node, parentChainId);
            segments.push(obj);
        } else if (node.type === 'bubble') {
            const obj = BubbleObject.fromApiNode(node, parentChainId);
            bubbles.push(obj);
        }
    }

    // Squish positions toward spawn point
    const allObjects = [...segments, ...bubbles];
    if (allObjects.length > 0 && spawnPos) {
        let cx = 0, cy = 0, count = 0;
        for (const obj of allObjects) {
            for (const n of obj.physicsNodes) { cx += n.x; cy += n.y; count++; }
        }
        if (count > 0) {
            cx /= count; cy /= count;
            const squish = 0.15;
            for (const obj of allObjects) {
                for (const n of obj.physicsNodes) {
                    n.homeX = n.x;
                    n.homeY = n.y;
                    n.x = spawnPos.x + (n.homeX - cx) * squish;
                    n.y = spawnPos.y + (n.homeY - cy) * squish;
                }
            }
        }
    }

    // Register all ends
    for (const obj of allObjects) {
        registry.registerAll(obj.ends.head, obj);
        registry.registerAll(obj.ends.tail, obj);
    }

    return { segments, bubbles };
}

/**
 * Detect which GFA links from a /pop response are deletion links
 * (source→sink bypass) and mark them.
 *
 * @param {object} apiData — /pop response (mutated in place)
 * @param {string} bubbleId — the popped bubble's ID
 */
export function markDeletionLinks(apiData, bubbleId) {
    const sourceSet = new Set((apiData.source_segs || []).map(s => `s${s}`));
    const sinkSet = new Set((apiData.sink_segs || []).map(s => `s${s}`));
    for (const link of (apiData.links || [])) {
        const src = String(link.source);
        const tgt = String(link.target);
        if ((sourceSet.has(src) && sinkSet.has(tgt)) ||
            (sinkSet.has(src) && sourceSet.has(tgt))) {
            link.is_deletion = true;
            link.bubble_id = bubbleId;
        }
    }
}

/**
 * Resolve a GFA link from /pop response using the registry.
 * Returns { fromNode, toNode } or null if either end is dangling.
 *
 * @param {object} rawLink — link from API (has source, target, from_strand, to_strand)
 * @returns {{ fromNode: object, toNode: object, isDeletion: boolean }|null}
 */
export function resolveApiLink(rawLink) {
    const fromSegId = String(rawLink.source);
    const toSegId = String(rawLink.target);

    const fromObj = registry.resolve(fromSegId);
    const toObj = registry.resolve(toSegId);
    if (!fromObj || !toObj) return null;

    // Build a link-like object for resolveEnd
    const linkForResolve = {
        fromSegId: fromSegId,
        toSegId: toSegId,
        source: fromSegId,
        target: toSegId,
        fromStrand: rawLink.from_strand || '+',
        toStrand: rawLink.to_strand || '+',
    };

    const fromNode = fromObj.resolveEnd(linkForResolve);
    const toNode = toObj.resolveEnd(linkForResolve);
    if (!fromNode || !toNode) return null;

    const isDeletion = fromObj === toObj && fromObj.isDeletionLink(linkForResolve);

    return { fromNode, toNode, isDeletion };
}
