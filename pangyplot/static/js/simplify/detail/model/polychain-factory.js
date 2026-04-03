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

// --- Polychain resampling (mirrors polychain-adapter.js logic) ---

const MIN_NODES = 2;

function resamplePolyline(chain) {
    const pl = chain.polyline;
    if (!pl || pl.length < 2) return null;

    const bpSpan = chain.bp_span || 1;
    const targetCount = Math.max(MIN_NODES, Math.round(Math.pow(Math.log10(bpSpan + 1), 2)));

    if (pl.length <= targetCount) return pl.slice();

    // Cumulative arc lengths
    const cum = [0];
    for (let i = 1; i < pl.length; i++) {
        const dx = pl[i][0] - pl[i - 1][0];
        const dy = pl[i][1] - pl[i - 1][1];
        cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const totalLen = cum[pl.length - 1] || 1;

    const samples = [pl[0]];
    for (let k = 1; k < targetCount - 1; k++) {
        const d = (k / (targetCount - 1)) * totalLen;
        let lo = 0;
        while (lo < cum.length - 2 && cum[lo + 1] < d) lo++;
        const segLen = cum[lo + 1] - cum[lo];
        const frac = segLen > 1e-9 ? (d - cum[lo]) / segLen : 0;
        samples.push([
            pl[lo][0] + frac * (pl[lo + 1][0] - pl[lo][0]),
            pl[lo][1] + frac * (pl[lo + 1][1] - pl[lo][1]),
        ]);
    }
    samples.push(pl[pl.length - 1]);
    return samples;
}

function computeLoopFactor(polyline) {
    if (!polyline || polyline.length < 3) return 0;
    const head = polyline[0];
    const tail = polyline[polyline.length - 1];
    const headTailDist = Math.hypot(tail[0] - head[0], tail[1] - head[1]);
    let totalLen = 0;
    for (let i = 1; i < polyline.length; i++) {
        totalLen += Math.hypot(
            polyline[i][0] - polyline[i - 1][0],
            polyline[i][1] - polyline[i - 1][1]
        );
    }
    if (totalLen < 1e-9) return 0;
    return Math.max(0, 1 - headTailDist / (totalLen * 0.3));
}

// --- Factory: detail-tiles chain → PolychainContainer ---

/**
 * Create a PolychainContainer from a /detail-tiles chain object.
 *
 * Produces spine nodes + spine links in the same format the current
 * polychain-adapter creates, so they can be dropped into the force sim.
 *
 * @param {object} chain — chain object from /detail-tiles response
 * @returns {PolychainContainer}
 */
export function createContainerFromChain(chain) {
    const samples = chain.polychainNodes || resamplePolyline(chain);
    if (!samples || samples.length < 2) return null;

    const nSamples = samples.length;
    const loopFactor = computeLoopFactor(chain.polyline);
    const chainId = chain.id;

    // Build spine nodes (same shape as polychain-adapter creates)
    const spineNodes = [];
    for (let i = 0; i < nSamples; i++) {
        spineNodes.push({
            id: `pn_${chainId}_${i}`,
            iid: `pn_${chainId}_${i}`,
            x: samples[i][0],
            y: samples[i][1],
            homeX: samples[i][0],
            homeY: samples[i][1],
            chainId: chainId,
            isPolychainNode: true,
            isSpineNode: true,
            nodeIndex: i,
            chainNodeCount: nSamples,
            loopFactor: loopFactor,
            radius: 0,
            width: 0,
        });
    }

    // Build spine links (sequential, same shape as polychain-adapter)
    let chainArcLen = 0;
    for (let i = 0; i < nSamples - 1; i++) {
        chainArcLen += Math.hypot(
            samples[i + 1][0] - samples[i][0],
            samples[i + 1][1] - samples[i][1]
        );
    }
    const uniformLen = chainArcLen / (nSamples - 1) || 1;

    const spineLinks = [];
    for (let i = 0; i < nSamples - 1; i++) {
        spineLinks.push({
            source: spineNodes[i],
            target: spineNodes[i + 1],
            isSpineLink: true,
            isPolychainLink: true, // compat: forces check this flag
            isKinkLink: false,
            chainId: chainId,
            length: uniformLen,
            loopFactor: loopFactor,
            chainArcLen: chainArcLen,
        });
    }

    // Normalize seg IDs to s-prefixed
    const headSegs = (chain.sourceSegs || chain.source_segs || []).map(s =>
        String(s).startsWith('s') ? String(s) : `s${s}`
    );
    const tailSegs = (chain.sinkSegs || chain.sink_segs || []).map(s =>
        String(s).startsWith('s') ? String(s) : `s${s}`
    );

    return new PolychainContainer({
        id: chainId,
        spineNodes,
        spineLinks,
        headSegs,
        tailSegs,
        bubbleMeta: [], // populated later by bubble-meta-cache
    });
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
