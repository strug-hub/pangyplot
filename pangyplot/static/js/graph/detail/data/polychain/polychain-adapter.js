// Adapter: orchestrates creation of PolychainContainers and junction SegmentObjects
// from /detail-tiles API responses, resolves all links through the unified
// segment-registry, and adds everything to the D3 force simulation.

import { addPoppedNodes, removeNodesByChainIds } from '../../engines/force-engine.js';
import { state } from '../../../state.js';
import { pointToSegmentDist } from '../../../utils/geometry.js';
import * as registry from '../../model/segment-registry.js';
import { PolychainContainer } from '../../model/polychain-container.js';
import { SegmentObject } from '../../model/segment-object.js';
import { getContainer, addContainer, removeContainer,
         addObject, clearModel, computeAllGeneOverlaps } from '../../model/model-manager.js';
import { getGenePins } from '@graph-data/gene-data.js';

/** Check if a chain already has a container (avoid re-creating during incremental adds). */
export function isSplitRootChain(chainId) {
    return !!getContainer(chainId);
}

/**
 * Compute cumulative arc lengths along a polyline.
 * Returns array of length pl.length with cumLen[0]=0.
 */
export function cumulativeLengths(pl) {
    const cumLen = [0];
    for (let i = 1; i < pl.length; i++) {
        cumLen.push(cumLen[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
    }
    return cumLen;
}

/**
 * Interpolate a point at arc-length distance `d` along a polyline.
 */
export function interpolateAtDist(pl, cumLen, d) {
    if (d <= 0) return [pl[0][0], pl[0][1]];
    if (d >= cumLen[cumLen.length - 1]) return [pl[pl.length - 1][0], pl[pl.length - 1][1]];
    // Binary search for the segment
    let lo = 0, hi = cumLen.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cumLen[mid] <= d) lo = mid; else hi = mid;
    }
    const segLen = cumLen[hi] - cumLen[lo];
    const t = segLen > 0 ? (d - cumLen[lo]) / segLen : 0;
    return [
        pl[lo][0] + t * (pl[hi][0] - pl[lo][0]),
        pl[lo][1] + t * (pl[hi][1] - pl[lo][1]),
    ];
}

/**
 * Extract a sub-polyline from fractional range [tStart, tEnd] along a polyline.
 */
export function extractSubPolyline(pl, tStart, tEnd) {
    if (!pl || pl.length < 2) return null;
    const cumLen = cumulativeLengths(pl);
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return null;

    const dStart = tStart * totalLen;
    const dEnd = tEnd * totalLen;

    const startPt = interpolateAtDist(pl, cumLen, dStart);
    const endPt = interpolateAtDist(pl, cumLen, dEnd);

    const sub = [startPt];
    for (let i = 1; i < pl.length - 1; i++) {
        if (cumLen[i] > dStart && cumLen[i] < dEnd) {
            sub.push([pl[i][0], pl[i][1]]);
        }
    }
    sub.push(endPt);
    return sub;
}


/**
 * Flip a chain: reverse polychain node positions so head↔tail swap visually.
 */
export function flipChain(chainId) {
    const container = getContainer(chainId);
    if (!container || container.spineNodes.length < 2) return false;
    const nodes = container.spineNodes;

    const positions = nodes.map(n => ({ x: n.x, y: n.y, homeX: n.homeX, homeY: n.homeY }));
    for (let i = 0; i < nodes.length; i++) {
        const rev = positions[nodes.length - 1 - i];
        nodes[i].x = rev.x;
        nodes[i].y = rev.y;
        nodes[i].homeX = rev.homeX;
        nodes[i].homeY = rev.homeY;
    }
    return true;
}

/**
 * Initialize the polychain layer: create polychain nodes from chain polylines,
 * junction nodes from naked segments, and all links connecting them.
 * Called once after detailData is set.
 */
export function initPolychainLayer() {
    const dd = state.detailData;
    if (!dd) return;

    clearModel();

    const allNodes = [];
    const allLinks = [];

    // Phase A: Create containers (each builds spine + anchors internally)
    for (const chain of dd.chains) {
        const container = PolychainContainer.fromChainData(chain);
        if (!container) continue;
        addContainer(container);

        // Collect spine nodes + links for D3 sim
        allNodes.push(...container.spineNodes);
        allLinks.push(...container.spineLinks);

        // Collect anchor nodes for D3 sim
        allNodes.push(...container.getAllAnchorNodes());

        // Compute parent-side perpendiculars (cross-chain concern)
        _computeParentPerps(container, chain, dd);
    }

    // Phase B: Create junction SegmentObjects
    processJunctionGraph(dd, allNodes, allLinks);

    // Phase C: Resolve shared-segment links through registry
    resolveSharedSegmentLinks(dd, allLinks);

    // Phase D: Create invisible spine-level copies of inter-chain links.
    // Visible links attach to anchors (pinned) for the model layer.
    // Invisible copies attach to spine head/tail nodes (free) so link forces
    // can pull chains — same physics as before the SimObject refactor.
    _addSpinePhysicsLinks(allLinks);

    // Phase E: Add everything to D3 sim
    if (allNodes.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }

    // Phase F: Compute gene overlaps for all objects
    computeAllGeneOverlaps(getGenePins());
}

// ---------------------------------------------------------------
// Junction graph processing
// ---------------------------------------------------------------

function _ensurePrefix(id) {
    const s = String(id);
    return s.startsWith('s') ? s : `s${s}`;
}

/**
 * For a segId that belongs to a chain, return the spine head or tail node.
 * Returns null if the seg doesn't belong to any chain.
 */
function _spineNodeForSeg(segId) {
    const obj = registry.resolve(segId);
    if (!obj || !obj.container) return null;
    const c = obj.container;
    if (c.headSegs.includes(segId)) return c.spineNodes[0];
    if (c.tailSegs.includes(segId)) return c.spineNodes[c.spineNodes.length - 1];
    return null;
}

/**
 * Create junction SegmentObjects and resolve junction graph links
 * through the unified segment registry.
 */
function processJunctionGraph(dd, allNodes, allLinks) {
    const jg = dd.junctionGraph;
    const jls = dd.junctionLinks;
    const junctionNodeIdSet = new Set();

    if (jg && jg.nodes.length > 0) {
        // Create SegmentObjects for each junction node
        for (const apiNode of jg.nodes) {
            junctionNodeIdSet.add(apiNode.id);
            const obj = SegmentObject.fromApiNode(apiNode, '__junction__');

            // Position kinks along ODGI layout geometry
            _positionKinksFromOdgi(obj, apiNode);

            // Tag for junction identification
            for (const n of obj.physicsNodes) n.chainId = '__junction__';

            // Register ends in segment-registry
            registry.registerAll(obj.ends.head, obj);
            registry.registerAll(obj.ends.tail, obj);
            addObject(obj);

            allNodes.push(...obj.physicsNodes);
            allLinks.push(...obj.physicsLinks);
        }

        // Resolve junction graph links through registry
        for (const rawLink of (jg.links || [])) {
            const sId = _ensurePrefix(rawLink.source);
            const tId = _ensurePrefix(rawLink.target);

            const linkForResolve = {
                source: sId, target: tId,
                fromStrand: rawLink.from_strand || '+',
                toStrand: rawLink.to_strand || '+',
            };

            const fromNode = registry.resolveForLink(linkForResolve, sId);
            const toNode = registry.resolveForLink(linkForResolve, tId);
            if (!fromNode?.iid || !toNode?.iid) continue;

            allLinks.push(_makeGfaLink(fromNode, toNode, sId, tId, rawLink));
        }

        // Endpoint-to-endpoint junction links (neither seg in junction graph)
        if (jls && jls.length > 0) {
            _resolveEndpointJunctionLinks(jls, junctionNodeIdSet, allLinks);
        }

    } else if (jls && jls.length > 0) {
        // No junction graph — endpoint-to-endpoint only
        _resolveEndpointJunctionLinks(jls, new Set(), allLinks);
    }
}

/**
 * Position a SegmentObject's kink nodes along ODGI layout coordinates.
 */
function _positionKinksFromOdgi(obj, apiNode) {
    const nodes = obj.physicsNodes;
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        nodes[i].x = apiNode.x1 + t * (apiNode.x2 - apiNode.x1);
        nodes[i].y = apiNode.y1 + t * (apiNode.y2 - apiNode.y1);
        nodes[i].homeX = nodes[i].x;
        nodes[i].homeY = nodes[i].y;
    }
}

/**
 * Create a GFA link between two resolved d3 force nodes.
 */
function _makeGfaLink(fromNode, toNode, fromSegId, toSegId, rawLink) {
    const linkLen = (rawLink.length || 0) > 0
        ? Math.min(rawLink.length / 100, 1000) : 10;
    return {
        isNode: false, isLink: true, class: 'link',
        iid: `${fromNode.iid}${rawLink.from_strand || '+'}${toNode.iid}${rawLink.to_strand || '+'}`,
        source: fromNode.iid, target: toNode.iid,
        sourceIid: fromNode.iid, targetIid: toNode.iid,
        sourceId: fromSegId, targetId: toSegId,
        type: 'link',
        chainId: null,
        isDel: false,
        isKinkLink: false, isRef: false, isDrawn: true,
        length: linkLen, width: 1,
        contained: rawLink.contained || [],
        frequency: rawLink.frequency || 0,
        fromStrand: rawLink.from_strand || '+',
        toStrand: rawLink.to_strand || '+',
    };
}

/**
 * Resolve endpoint-to-endpoint junction links through registry.
 */
function _resolveEndpointJunctionLinks(jls, junctionNodeIdSet, allLinks) {
    for (const jl of jls) {
        const segA = `s${jl.segs[0]}`;
        const segB = `s${jl.segs[1]}`;
        if (junctionNodeIdSet.has(segA) || junctionNodeIdSet.has(segB)) continue;

        const linkForResolve = {
            source: segA, target: segB,
            fromStrand: '+', toStrand: '+',
        };
        const nodeA = registry.resolveForLink(linkForResolve, segA);
        const nodeB = registry.resolveForLink(linkForResolve, segB);
        if (!nodeA?.iid || !nodeB?.iid || nodeA.iid === nodeB.iid) continue;

        allLinks.push(makeInterChainLink(nodeA, nodeB, segA, segB));
    }
}

/**
 * Resolve shared-segment links between chains through registry.
 * Two chains that share an endpoint seg (sinkSeg of one = sourceSeg of other)
 * get linked via their SimObject anchors.
 */
function resolveSharedSegmentLinks(dd, allLinks) {
    const seenSharedPairs = new Set();
    for (const chain of dd.chains) {
        for (const sid of (chain.sinkSegs || [])) {
            for (const other of dd.chains) {
                if (other.id === chain.id) continue;
                if (!(other.sourceSegs || []).includes(sid)) continue;

                const linkForResolve = {
                    source: sid, target: sid,
                    fromStrand: '+', toStrand: '+',
                };
                const tailNode = registry.resolveForLink(linkForResolve, sid);
                // For the target side, we need the OTHER chain's anchor
                // (same segId but registered to a different SimObject).
                // Since last-write-wins in registry, we need to resolve
                // from both chains' containers directly.
                const srcContainer = getContainer(chain.id);
                const tgtContainer = getContainer(other.id);
                if (!srcContainer || !tgtContainer) continue;

                // Get tail anchor from source chain's segment
                const srcSeg = srcContainer.segments.find(
                    s => s.ends.tail.includes(sid));
                const tgtSeg = tgtContainer.segments.find(
                    s => s.ends.head.includes(sid));
                if (!srcSeg || !tgtSeg) continue;

                const srcAnchor = srcSeg.resolveEnd({
                    source: sid, target: sid,
                    fromStrand: '+', toStrand: '+',
                });
                const tgtAnchor = tgtSeg.resolveEnd({
                    source: sid, target: sid,
                    fromStrand: '+', toStrand: '+',
                });
                if (!srcAnchor?.iid || !tgtAnchor?.iid) continue;
                if (srcAnchor.iid === tgtAnchor.iid) continue;

                const pairKey = `${srcAnchor.iid}↔${tgtAnchor.iid}`;
                if (seenSharedPairs.has(pairKey)) continue;
                seenSharedPairs.add(pairKey);
                allLinks.push(makeInterChainLink(srcAnchor, tgtAnchor, sid, sid));
            }
        }
    }
}

/**
 * Create invisible spine-level copies of inter-chain and junction GFA links.
 *
 * Visible links connect to anchors/kink nodes (for the model layer).
 * But anchors are pinned — link forces can't pull the chain through them.
 * Invisible copies connect to spine head/tail nodes (free-moving) so the
 * physics matches the old system where junction links shaped chain loops.
 *
 * These are never removed — they live as long as the spine, just like
 * spine links between consecutive nodes.
 */
function _addSpinePhysicsLinks(allLinks) {
    const spineLinks = [];
    // Scan links that were just added (GFA links + inter-chain links)
    for (const link of allLinks) {
        if (link.isPolychainLink || link.isSpineLink) continue;  // skip spine infrastructure
        if (link.isKinkLink) continue;  // skip within-segment kink links

        // Find spine node equivalents for each endpoint
        const srcSegId = link.sourceId || link.sourceSegId;
        const tgtSegId = link.targetId || link.targetSegId;
        if (!srcSegId || !tgtSegId) continue;

        const srcSpine = _spineNodeForSeg(srcSegId);
        const tgtSpine = _spineNodeForSeg(tgtSegId);
        // Need at least one spine endpoint (the other may be a junction kink node)
        if (!srcSpine && !tgtSpine) continue;

        const src = srcSpine || link.source;
        const tgt = tgtSpine || link.target;
        if (src === tgt) continue;
        // Both are strings (iids) at this point if from _makeGfaLink — resolve to objects
        const srcRef = typeof src === 'object' ? src : (srcSpine || link.source);
        const tgtRef = typeof tgt === 'object' ? tgt : (tgtSpine || link.target);

        spineLinks.push({
            source: srcRef,
            target: tgtRef,
            isSpineLink: true,
            isPolychainLink: false,
            isKinkLink: false,
            isDrawn: false,
            isVisible: false,
            chainId: null,
            length: link.length || 10,
        });
    }
    allLinks.push(...spineLinks);
}

/**
 * Add containers for newly added chains (incremental on pan).
 */
export function addChainsToPolychainLayer(newChains, dd) {
    if (!dd || newChains.length === 0) return;

    const allNodes = [];
    const allLinks = [];

    // 1. Create containers for new chains
    for (const chain of newChains) {
        if (getContainer(chain.id)) continue;
        const container = PolychainContainer.fromChainData(chain);
        if (!container) continue;
        addContainer(container);
        allNodes.push(...container.spineNodes);
        allLinks.push(...container.spineLinks);
        allNodes.push(...container.getAllAnchorNodes());
        _computeParentPerps(container, chain, dd);
    }

    // 2. Remove old junction nodes from sim, rebuild
    removeNodesByChainIds(new Set(['__junction__']));
    processJunctionGraph(dd, allNodes, allLinks);

    // 3. Shared-segment links (involving new chains)
    const newChainIds = new Set(newChains.map(c => c.id));
    const seenSharedPairs = new Set();
    for (const chain of dd.chains) {
        for (const sid of (chain.sinkSegs || [])) {
            for (const other of dd.chains) {
                if (other.id === chain.id) continue;
                if (!newChainIds.has(chain.id) && !newChainIds.has(other.id)) continue;
                if (!(other.sourceSegs || []).includes(sid)) continue;

                const srcContainer = getContainer(chain.id);
                const tgtContainer = getContainer(other.id);
                if (!srcContainer || !tgtContainer) continue;

                const srcSeg = srcContainer.segments.find(s => s.ends.tail.includes(sid));
                const tgtSeg = tgtContainer.segments.find(s => s.ends.head.includes(sid));
                if (!srcSeg || !tgtSeg) continue;

                const linkObj = { source: sid, target: sid, fromStrand: '+', toStrand: '+' };
                const srcAnchor = srcSeg.resolveEnd(linkObj);
                const tgtAnchor = tgtSeg.resolveEnd(linkObj);
                if (!srcAnchor?.iid || !tgtAnchor?.iid || srcAnchor.iid === tgtAnchor.iid) continue;

                const pairKey = `${srcAnchor.iid}↔${tgtAnchor.iid}`;
                if (seenSharedPairs.has(pairKey)) continue;
                seenSharedPairs.add(pairKey);
                allLinks.push(makeInterChainLink(srcAnchor, tgtAnchor, sid, sid));
            }
        }
    }

    // Invisible spine-level copies for physics
    _addSpinePhysicsLinks(allLinks);

    if (allNodes.length > 0 || allLinks.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }

    // Recompute gene overlaps for all objects (new + existing)
    computeAllGeneOverlaps(getGenePins());
}

/**
 * Remove containers for specific chains.
 */
export function removeChainsFromPolychainLayer(chainIds) {
    for (const cid of chainIds) {
        removeContainer(cid);
    }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * Reconstruct a parent chain's polyline from its connector fragments.
 */
function _getParentPolyline(parentChainId, dd) {
    const exact = dd.chains.find(c => c.id === parentChainId);
    if (exact?.polyline?.length >= 2) return exact.polyline;

    const prefix = parentChainId + ':';
    const connectors = dd.chains.filter(c => c.id.startsWith(prefix) && c.polyline?.length >= 2);
    if (connectors.length === 0) return null;
    connectors.sort((a, b) => a.polyline[0][0] - b.polyline[0][0]);

    const combined = [];
    for (const c of connectors) combined.push(...c.polyline);
    return combined.length >= 2 ? combined : null;
}

/**
 * Compute parent-side perpendicular vectors for child chains.
 * Tags spine nodes with parentPerps for the parentSideForce.
 */
function _computeParentPerps(container, chain, dd) {
    if (!chain.ancestors?.length) return;
    const nodes = container.spineNodes;

    let cx = 0, cy = 0;
    for (const n of nodes) { cx += n.x; cy += n.y; }
    cx /= nodes.length; cy /= nodes.length;

    const perps = [];
    for (const ancestor of chain.ancestors) {
        const ppl = _getParentPolyline(ancestor.chain, dd);
        if (!ppl || ppl.length < 2) continue;

        let bestDist = Infinity, bestIdx = 0;
        for (let i = 0; i < ppl.length - 1; i++) {
            const d = pointToSegmentDist(cx, cy, ppl[i][0], ppl[i][1], ppl[i+1][0], ppl[i+1][1]);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        const ax = ppl[bestIdx][0], ay = ppl[bestIdx][1];
        const bx = ppl[bestIdx+1][0], by = ppl[bestIdx+1][1];
        const tx = bx - ax, ty = by - ay;
        const tLenSq = tx * tx + ty * ty;
        const tLen = Math.sqrt(tLenSq) || 1;
        const t = tLenSq > 0
            ? Math.max(0, Math.min(1, ((cx - ax) * tx + (cy - ay) * ty) / tLenSq))
            : 0;
        const mx = ax + t * tx, my = ay + t * ty;

        let px = -ty / tLen, py = tx / tLen;
        const dot = (cx - mx) * px + (cy - my) * py;
        if (dot < 0) { px = -px; py = -py; }
        perps.push({ px, py, mx, my, ppl });
    }

    if (perps.length > 0) {
        for (const n of nodes) n.parentPerps = perps;
    }
}

function makeInterChainLink(source, target, sourceSegId, targetSegId) {
    return {
        source, target,
        isInterChain: true,
        isKinkLink: false,
        chainId: null,
        length: 10,
        sourceSegId: sourceSegId || null,
        targetSegId: targetSegId || null,
    };
}


