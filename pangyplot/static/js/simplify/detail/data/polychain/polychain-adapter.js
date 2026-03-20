// Adapter: converts /detail-tiles API responses into polychain nodes
// for use in the simplify detail force simulation.
//
// POLYCHAIN PHYSICS EXPERIMENT:
// Each chain's polyline vertices become force nodes connected sequentially.
// Junction (naked) segments also become force nodes linked to polychain nodes.
// No phantoms, no popping — just polychain nodes + junctions.

import { deserializeSubgraph } from '../../../../graph/data/records/deserializer/deserialize-subgraph.js';
import { getForceNodes, getForceLinks } from '../force-data.js';
import { addPoppedNodes, removeNodesByChainIds } from '../../engines/force-engine.js';
import { state } from '../../../simplify-state.js';
import { pointToSegmentDist } from '../../../utils/geometry.js';

// chainId → [polychain node objects in polyline order]
const chainPolychainNodes = new Map();

// "s{id}" → polychain node (endpoint seg → head or tail node)
const segToPolychain = new Map();

// Resampling constants
const MIN_NODES = 2;

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
 * Resample a chain's polyline with node count proportional to bpSpan
 * and density concentrated where bubbles are denser.
 *
 * Returns array of [x, y] sample points (always includes first and last).
 */
function resamplePolyline(chain) {
    const pl = chain.polyline;
    if (!pl || pl.length < 2) return null;

    // Determine target node count from bp span (log curve)
    // log10(1k)=3 → 3, log10(10k)=4 → 8, log10(100k)=5 → 17
    // log10(1M)=6 → 28, log10(10M)=7 → 43
    const bp = chain.bpSpan || chain.length || 1;
    const logBp = Math.log10(Math.max(bp, 10));
    let nTarget = Math.max(MIN_NODES, Math.round(logBp * logBp));

    // If polyline already has fewer points than target, just use it directly
    if (pl.length <= nTarget) return pl;

    const cumLen = cumulativeLengths(pl);
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return pl;

    // Interior points = nTarget - 2 (first and last are always included)
    const nInterior = nTarget - 2;
    if (nInterior <= 0) return [pl[0], pl[pl.length - 1]];

    // Build density-weighted t values from bubble positions
    const bubPos = chain.bubblePositions;
    let tValues;

    if (bubPos && bubPos.length >= 2 && nInterior >= 2) {
        // Build a CDF from bubble density, then invert to get sample t values.
        // Each bubble contributes a Gaussian-ish bump; we discretize into bins.
        const nBins = 200;
        const density = new Float64Array(nBins);
        // Base uniform density (so empty regions still get some nodes)
        density.fill(0.5);
        // Add bubble contributions
        const sigma = 1 / (nBins * 0.5); // ~1% of chain length spread
        for (const bp of bubPos) {
            const center = bp.t;
            for (let b = 0; b < nBins; b++) {
                const bt = (b + 0.5) / nBins;
                const d = (bt - center) / sigma;
                density[b] += Math.exp(-0.5 * d * d);
            }
        }
        // Build CDF
        const cdf = new Float64Array(nBins + 1);
        for (let b = 0; b < nBins; b++) {
            cdf[b + 1] = cdf[b] + density[b];
        }
        const total = cdf[nBins];

        // Invert CDF: for each of nInterior equally-spaced quantiles, find t
        tValues = [];
        for (let i = 0; i < nInterior; i++) {
            const target = total * (i + 1) / (nInterior + 1);
            // Binary search in CDF
            let lo = 0, hi = nBins;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (cdf[mid + 1] < target) lo = mid + 1; else hi = mid;
            }
            const binT = (lo + 0.5) / nBins;
            tValues.push(binT);
        }
    } else {
        // No bubble data — uniform spacing
        tValues = [];
        for (let i = 0; i < nInterior; i++) {
            tValues.push((i + 1) / (nInterior + 1));
        }
    }

    // Convert t values (0-1) to arc-length distances and sample
    const samples = [pl[0]];
    for (const t of tValues) {
        samples.push(interpolateAtDist(pl, cumLen, t * totalLen));
    }
    samples.push(pl[pl.length - 1]);
    return samples;
}

/**
 * Get the live [x,y] positions of a chain's polychain nodes.
 * Used by renderers to draw flexing polylines.
 */
export function getPolychainPositions(chainId) {
    const nodes = chainPolychainNodes.get(chainId);
    if (!nodes || nodes.length < 2) return null;
    return nodes.map(n => [n.x, n.y]);
}

/**
 * Initialize the polychain layer: create polychain nodes from chain polylines,
 * junction nodes from naked segments, and all links connecting them.
 * Called once after detailData is set.
 */
export function initPolychainLayer() {
    const dd = state.detailData;
    if (!dd) return;

    chainPolychainNodes.clear();
    segToPolychain.clear();

    const allNodes = [];
    const allLinks = [];

    // 1. Create polychain nodes for every chain (resampled by bp size + bubble density)
    for (const chain of dd.chains) {
        createPolychainForChain(chain, allNodes, allLinks, dd);
    }

    // 2. Deserialize junction graph nodes + links
    processJunctionGraph(dd, allNodes, allLinks);

    // 4. Shared-segment links: adjacent chains sharing an endpoint seg
    const seenSharedPairs = new Set();
    for (const chain of dd.chains) {
        for (const sid of (chain.sinkSegs || [])) {
            const key = `s${sid}`;
            const sinkNode = chainPolychainNodes.get(chain.id);
            if (!sinkNode || sinkNode.length === 0) continue;
            const tail = sinkNode[sinkNode.length - 1];
            for (const other of dd.chains) {
                if (other.id === chain.id) continue;
                if (!(other.sourceSegs || []).includes(sid)) continue;
                const otherNodes = chainPolychainNodes.get(other.id);
                if (!otherNodes || otherNodes.length === 0) continue;
                const otherHead = otherNodes[0];
                if (tail === otherHead) continue;
                const pairKey = `${tail.iid}↔${otherHead.iid}`;
                if (seenSharedPairs.has(pairKey)) continue;
                seenSharedPairs.add(pairKey);
                allLinks.push(makeInterChainLink(tail, otherHead, String(sid), String(sid)));
            }
        }
    }

    if (allNodes.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }
}

/**
 * Process junction graph nodes + links into force-sim objects.
 * Shared by both init and incremental paths.
 */
function processJunctionGraph(dd, allNodes, allLinks) {
    const jg = dd.junctionGraph;
    const jls = dd.junctionLinks;
    const junctionNodeIdSet = new Set();

    if (jg && jg.nodes.length > 0) {
        for (const n of jg.nodes) junctionNodeIdSet.add(n.id);

        // Build polychain record wrappers for link resolution
        const polychainRecords = new Map();
        for (const [chainId, nodes] of chainPolychainNodes) {
            if (nodes.length === 0) continue;
            const head = nodes[0];
            const tail = nodes[nodes.length - 1];
            polychainRecords.set(head.iid, makePolychainRecord(head));
            polychainRecords.set(tail.iid, makePolychainRecord(tail));
        }

        // Build segToChainPolychain for non-endpoint segs (from junctionSegChains).
        // Uses geometric proximity to pick head vs tail of the nearest chain.
        const segToChainPolychain = new Map();
        const jscMap = dd.junctionSegChains || {};
        const junctionNodePosMap = new Map(jg.nodes.map(n => [n.id, n]));

        for (const rawLink of (jg.links || [])) {
            const sId = typeof rawLink.source === 'string' ? rawLink.source : `s${rawLink.source}`;
            const tId = typeof rawLink.target === 'string' ? rawLink.target : `s${rawLink.target}`;
            for (const [segId, otherSegId] of [[sId, tId], [tId, sId]]) {
                if (segToPolychain.has(segId) || segToChainPolychain.has(segId)) continue;
                if (junctionNodeIdSet.has(segId)) continue;
                const chainIds = jscMap[segId];
                if (!chainIds || chainIds.length === 0) continue;
                const otherNode = junctionNodePosMap.get(otherSegId);
                for (const cid of chainIds) {
                    const nodes = chainPolychainNodes.get(cid);
                    if (!nodes || nodes.length === 0) continue;
                    const head = nodes[0];
                    const tail = nodes[nodes.length - 1];
                    let pick;
                    if (otherNode) {
                        const refX = (otherNode.x1 + otherNode.x2) / 2;
                        const refY = (otherNode.y1 + otherNode.y2) / 2;
                        const dH = Math.hypot(refX - head.x, refY - head.y);
                        const dT = Math.hypot(refX - tail.x, refY - tail.y);
                        pick = dH <= dT ? head : tail;
                    } else {
                        pick = head;
                    }
                    segToChainPolychain.set(segId, polychainRecords.get(pick.iid));
                    break;
                }
            }
        }

        // Deserialize junction nodes + links with polychain linkResolver
        const { nodes: jNodes, links: jLinks } = deserializeSubgraph(
            { nodes: jg.nodes, links: jg.links || [] },
            {
                tag: { chainId: '__junction__' },
                detectIndels: false,
                linkResolver: (segId) => {
                    const pn = segToPolychain.get(segId);
                    if (pn) return polychainRecords.get(pn.iid);
                    return segToChainPolychain.get(segId) || null;
                },
            }
        );

        // Set initial positions from ODGI layout — interpolate kinks along segment geometry
        const rawNodeMap = new Map(jg.nodes.map(n => [n.id, n]));
        const kinksByRecord = new Map();
        for (const node of jNodes) {
            if (!kinksByRecord.has(node.id)) kinksByRecord.set(node.id, []);
            kinksByRecord.get(node.id).push(node);
        }
        for (const [recId, kinks] of kinksByRecord) {
            const raw = rawNodeMap.get(recId);
            if (!raw) continue;
            kinks.sort((a, b) => {
                const ai = parseInt(a.iid.split('#')[1]) || 0;
                const bi = parseInt(b.iid.split('#')[1]) || 0;
                return ai - bi;
            });
            const n = kinks.length;
            for (let i = 0; i < n; i++) {
                const t = n === 1 ? 0.5 : i / (n - 1);
                kinks[i].x = raw.x1 + t * (raw.x2 - raw.x1);
                kinks[i].y = raw.y1 + t * (raw.y2 - raw.y1);
                kinks[i].homeX = kinks[i].x;
                kinks[i].homeY = kinks[i].y;
            }
        }

        allNodes.push(...jNodes);

        // Tag inter-chain links with seg IDs (for future rewiring if needed)
        const interNodeLinks = jLinks.filter(l => !l.isKinkLink);
        let createdIdx = 0;
        for (const rawLink of (jg.links || [])) {
            const sId = typeof rawLink.source === 'string' ? rawLink.source : `s${rawLink.source}`;
            const tId = typeof rawLink.target === 'string' ? rawLink.target : `s${rawLink.target}`;

            const sLocal = junctionNodeIdSet.has(sId);
            const tLocal = junctionNodeIdSet.has(tId);
            const sPolychain = !sLocal && (segToPolychain.has(sId) || segToChainPolychain.has(sId));
            const tPolychain = !tLocal && (segToPolychain.has(tId) || segToChainPolychain.has(tId));
            if (!(sLocal || sPolychain) || !(tLocal || tPolychain)) continue;

            const link = interNodeLinks[createdIdx++];
            if (!link) break;

            if (sPolychain || tPolychain) {
                link.isInterChain = true;
                link.chainId = null;
                if (sPolychain) {
                    link.sourceSegId = sId.replace(/^s/, '');
                    link.sourceStrand = rawLink.from_strand || null;
                }
                if (tPolychain) {
                    link.targetSegId = tId.replace(/^s/, '');
                    link.targetStrand = rawLink.to_strand || null;
                }
            }
        }

        allLinks.push(...jLinks);

        // Endpoint-to-endpoint junction links (neither seg in junction graph)
        if (jls && jls.length > 0) {
            for (const jl of jls) {
                const segA = `s${jl.segs[0]}`;
                const segB = `s${jl.segs[1]}`;
                if (junctionNodeIdSet.has(segA) || junctionNodeIdSet.has(segB)) continue;
                const pnA = segToPolychain.get(segA);
                const pnB = segToPolychain.get(segB);
                if (pnA && pnB && pnA !== pnB) {
                    allLinks.push(makeInterChainLink(pnA, pnB, String(jl.segs[0]), String(jl.segs[1])));
                }
            }
        }

    } else if (jls && jls.length > 0) {
        // No junction graph nodes — endpoint-to-endpoint only
        for (const jl of jls) {
            const pnA = segToPolychain.get(`s${jl.segs[0]}`);
            const pnB = segToPolychain.get(`s${jl.segs[1]}`);
            if (pnA && pnB && pnA !== pnB) {
                allLinks.push(makeInterChainLink(pnA, pnB, String(jl.segs[0]), String(jl.segs[1])));
            }
        }
    }
}

/**
 * Add polychain nodes for newly added chains only (incremental on pan).
 */
export function addChainsToPolychainLayer(newChains, dd) {
    if (!dd || newChains.length === 0) return;

    const allNodes = [];
    const allLinks = [];

    // 1. Create polychain nodes for new chains
    for (const chain of newChains) {
        if (chainPolychainNodes.has(chain.id)) continue;
        createPolychainForChain(chain, allNodes, allLinks, dd);
    }

    // 2. Shared-segment links between new and existing chains
    const newChainIds = new Set(newChains.map(c => c.id));
    const seenSharedPairs = new Set();
    for (const chain of dd.chains) {
        for (const sid of (chain.sinkSegs || [])) {
            const sinkNodes = chainPolychainNodes.get(chain.id);
            if (!sinkNodes || sinkNodes.length === 0) continue;
            const tail = sinkNodes[sinkNodes.length - 1];
            for (const other of dd.chains) {
                if (other.id === chain.id) continue;
                if (!newChainIds.has(chain.id) && !newChainIds.has(other.id)) continue;
                if (!(other.sourceSegs || []).includes(sid)) continue;
                const otherNodes = chainPolychainNodes.get(other.id);
                if (!otherNodes || otherNodes.length === 0) continue;
                const otherHead = otherNodes[0];
                if (tail === otherHead) continue;
                const pairKey = `${tail.iid}↔${otherHead.iid}`;
                if (seenSharedPairs.has(pairKey)) continue;
                seenSharedPairs.add(pairKey);
                allLinks.push(makeInterChainLink(tail, otherHead, String(sid), String(sid)));
            }
        }
    }

    // 3. Remove old junction nodes from sim, then rebuild from current data
    removeNodesByChainIds(new Set(['__junction__']));
    processJunctionGraph(dd, allNodes, allLinks);

    if (allNodes.length > 0 || allLinks.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }
}

/**
 * Remove polychain nodes for specific chains.
 */
export function removeChainsFromPolychainLayer(chainIds) {
    for (const cid of chainIds) {
        const nodes = chainPolychainNodes.get(cid);
        if (nodes) {
            // Clean up segToPolychain entries pointing to these nodes
            const nodeSet = new Set(nodes);
            for (const [key, pn] of segToPolychain) {
                if (nodeSet.has(pn)) {
                    segToPolychain.delete(key);
                }
            }
            chainPolychainNodes.delete(cid);
        }
    }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * Create polychain nodes + links for a single chain and append to allNodes/allLinks.
 * Resamples the polyline based on bp size and bubble density.
 */
/**
 * Compute loop factor from polyline geometry.
 * 1 - (head-to-tail distance / arc length). 0 = perfectly straight, 1 = endpoints overlap.
 */
function computeLoopFactor(pl) {
    if (!pl || pl.length < 3) return 0;
    const headToTail = Math.hypot(
        pl[pl.length - 1][0] - pl[0][0],
        pl[pl.length - 1][1] - pl[0][1]);
    let arcLen = 0;
    for (let i = 1; i < pl.length; i++) {
        arcLen += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
    }
    if (arcLen === 0) return 0;
    return Math.max(0, Math.min(1, 1 - headToTail / arcLen));
}

/**
 * Reconstruct a parent chain's polyline from its connector fragments.
 * The parent (e.g. "c123") is decomposed into connectors ("c123:100-200").
 * Falls back to exact match if the parent chain is still present as-is.
 */
function getParentPolyline(parentChainId, dd) {
    // Try exact match first
    const exact = dd.chains.find(c => c.id === parentChainId);
    if (exact?.polyline?.length >= 2) return exact.polyline;

    // Collect connector fragments: chains whose ID starts with "c123:"
    const prefix = parentChainId + ':';
    const connectors = dd.chains.filter(c => c.id.startsWith(prefix) && c.polyline?.length >= 2);
    if (connectors.length === 0) return null;

    // Sort by x-coordinate of first polyline point (connectors are spatially ordered)
    connectors.sort((a, b) => a.polyline[0][0] - b.polyline[0][0]);

    // Concatenate polylines
    const combined = [];
    for (const c of connectors) {
        combined.push(...c.polyline);
    }
    return combined.length >= 2 ? combined : null;
}

function createPolychainForChain(chain, allNodes, allLinks, dd) {
    // Prefer backend-precomputed polychain nodes, fall back to JS resampling
    const samples = chain.polychainNodes || resamplePolyline(chain);
    if (!samples || samples.length < 2) return;

    const nSamples = samples.length;
    const loopFactor = computeLoopFactor(chain.polyline);
    chain.loopFactor = loopFactor;

    const nodes = [];
    for (let i = 0; i < nSamples; i++) {
        const node = {
            id: `pn_${chain.id}_${i}`,
            iid: `pn_${chain.id}_${i}`,
            x: samples[i][0],
            y: samples[i][1],
            homeX: samples[i][0],
            homeY: samples[i][1],
            chainId: chain.id,
            isPolychainNode: true,
            nodeIndex: i,
            chainNodeCount: nSamples,
            loopFactor: loopFactor,
            radius: 0,
            width: 0,
        };
        nodes.push(node);
        allNodes.push(node);
    }

    chainPolychainNodes.set(chain.id, nodes);

    // Compute parent-side perpendiculars for child chains (not connectors).
    // Walk up the full ancestor chain so deeper children push away from all ancestors.
    if (dd && chain.ancestors?.length > 0) {
        // Child centroid
        let cx = 0, cy = 0;
        for (const n of nodes) { cx += n.x; cy += n.y; }
        cx /= nodes.length; cy /= nodes.length;

        const perps = [];
        for (const ancestor of chain.ancestors) {
            const ppl = getParentPolyline(ancestor.chain, dd);
            if (!ppl || ppl.length < 2) continue;

            // Find nearest segment on ancestor polyline
            let bestDist = Infinity, bestIdx = 0;
            for (let i = 0; i < ppl.length - 1; i++) {
                const d = pointToSegmentDist(cx, cy, ppl[i][0], ppl[i][1], ppl[i+1][0], ppl[i+1][1]);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }

            // Nearest point on ancestor segment (projection of centroid)
            const ax = ppl[bestIdx][0], ay = ppl[bestIdx][1];
            const bx = ppl[bestIdx+1][0], by = ppl[bestIdx+1][1];
            const tx = bx - ax, ty = by - ay;
            const tLenSq = tx * tx + ty * ty;
            const tLen = Math.sqrt(tLenSq) || 1;
            const t = tLenSq > 0
                ? Math.max(0, Math.min(1, ((cx - ax) * tx + (cy - ay) * ty) / tLenSq))
                : 0;
            const mx = ax + t * tx;
            const my = ay + t * ty;

            // Perpendicular (rotate tangent 90°)
            let px = -ty / tLen, py = tx / tLen;

            // Determine which side child centroid is on
            const dot = (cx - mx) * px + (cy - my) * py;
            if (dot < 0) { px = -px; py = -py; }

            perps.push({ px, py, mx, my, ppl });
        }

        if (perps.length > 0) {
            for (const n of nodes) {
                n.parentPerps = perps;
            }
        }
    }

    // Sequential links
    for (let i = 0; i < nodes.length - 1; i++) {
        const dx = samples[i + 1][0] - samples[i][0];
        const dy = samples[i + 1][1] - samples[i][1];
        allLinks.push({
            source: nodes[i],
            target: nodes[i + 1],
            isPolychainLink: true,
            isKinkLink: false,
            chainId: chain.id,
            length: Math.hypot(dx, dy) || 1,
        });
    }

    // Map endpoint segs → head/tail polychain nodes
    const head = nodes[0];
    const tail = nodes[nodes.length - 1];
    for (const sid of (chain.sourceSegs || [])) {
        segToPolychain.set(`s${sid}`, head);
    }
    for (const sid of (chain.sinkSegs || [])) {
        segToPolychain.set(`s${sid}`, tail);
    }
}

/**
 * Create a lightweight record wrapper for a polychain node, satisfying the
 * NodeRecord interface expected by deserializeSubgraph's linkResolver.
 */
function makePolychainRecord(node) {
    return {
        id: node.id,
        type: 'polychain',
        ranges: [],
        elements: {
            nodes: [{ head: () => node.iid, tail: () => node.iid }],
        },
    };
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
