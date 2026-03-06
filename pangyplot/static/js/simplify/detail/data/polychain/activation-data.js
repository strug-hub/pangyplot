// Pure computation for physics activation: center-out BFS chain walk.

import { state } from '../../../simplify-state.js';
import { polylineBbox, bboxCentroid } from '../../../utils/geometry.js';

let adjacency = null;
let adjacencyDataId = null;

// ---------------------------------------------------------------
// Adjacency graph
// ---------------------------------------------------------------

function buildAdjacency(chains, chainAdjacency) {
    const adj = new Map();
    for (const chain of chains) {
        adj.set(chain.id, new Set());
    }

    const segToChains = new Map();
    for (const chain of chains) {
        const id = chain.id;
        for (const seg of (chain.sourceSegs || [])) {
            if (!segToChains.has(seg)) segToChains.set(seg, []);
            segToChains.get(seg).push(id);
        }
        for (const seg of (chain.sinkSegs || [])) {
            if (!segToChains.has(seg)) segToChains.set(seg, []);
            segToChains.get(seg).push(id);
        }
    }
    for (const chain of chains) {
        const id = chain.id;
        for (const seg of (chain.sourceSegs || []).concat(chain.sinkSegs || [])) {
            const others = segToChains.get(seg);
            if (!others) continue;
            for (const otherId of others) {
                if (otherId !== id) {
                    adj.get(id).add(otherId);
                    adj.get(otherId).add(id);
                }
            }
        }
    }

    if (chainAdjacency) {
        const strToId = new Map();
        for (const chain of chains) {
            strToId.set(String(chain.id), chain.id);
        }
        for (const [idStr, neighbors] of Object.entries(chainAdjacency)) {
            const id = strToId.get(idStr);
            if (id === undefined || !adj.has(id)) continue;
            for (const rawNid of neighbors) {
                const nid = strToId.get(String(rawNid));
                if (nid !== undefined && adj.has(nid)) {
                    adj.get(id).add(nid);
                    adj.get(nid).add(id);
                }
            }
        }
    }

    return adj;
}

// ---------------------------------------------------------------
// Viewport clipping
// ---------------------------------------------------------------

function polylineTRange(polyline, vp) {
    if (polyline.length < 2) return null;

    const cumLen = [0];
    for (let i = 1; i < polyline.length; i++) {
        const dx = polyline[i][0] - polyline[i - 1][0];
        const dy = polyline[i][1] - polyline[i - 1][1];
        cumLen.push(cumLen[i - 1] + Math.hypot(dx, dy));
    }
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return null;

    let firstInside = -1, lastInside = -1;
    for (let i = 0; i < polyline.length; i++) {
        const [x, y] = polyline[i];
        if (x >= vp.minX && x <= vp.maxX && y >= vp.minY && y <= vp.maxY) {
            if (firstInside === -1) firstInside = i;
            lastInside = i;
        }
    }

    if (firstInside === -1) {
        const bbox = polylineBbox(polyline);
        if (!bbox) return null;
        if (bbox.maxX < vp.minX || bbox.minX > vp.maxX ||
            bbox.maxY < vp.minY || bbox.minY > vp.maxY) return null;
        return { tStart: 0, tEnd: 1 };
    }

    const iStart = Math.max(0, firstInside - 1);
    const iEnd = Math.min(polyline.length - 1, lastInside + 1);

    return {
        tStart: cumLen[iStart] / totalLen,
        tEnd: cumLen[iEnd] / totalLen,
    };
}

// ---------------------------------------------------------------
// Core: compute activation set via center-out BFS
// ---------------------------------------------------------------

export function computeActivationSet(chains, chainAdjacency, viewport, budget) {
    if (!chains || chains.length === 0) return null;

    if (adjacencyDataId !== state.detailData) {
        adjacency = buildAdjacency(chains, chainAdjacency);
        adjacencyDataId = state.detailData;
    }

    const marginX = (viewport.maxX - viewport.minX) * 0.1;
    const marginY = (viewport.maxY - viewport.minY) * 0.1;
    const vp = {
        minX: viewport.minX - marginX,
        minY: viewport.minY - marginY,
        maxX: viewport.maxX + marginX,
        maxY: viewport.maxY + marginY,
    };

    const chainInfo = new Map();
    const vpCenter = [
        (viewport.minX + viewport.maxX) / 2,
        (viewport.minY + viewport.maxY) / 2,
    ];

    for (const chain of chains) {
        const bbox = polylineBbox(chain.polyline);
        if (!bbox) continue;

        const visible = !(bbox.maxX < vp.minX || bbox.minX > vp.maxX ||
                          bbox.maxY < vp.minY || bbox.minY > vp.maxY);

        const centroid = bboxCentroid(bbox);
        const distToCenter = Math.hypot(centroid[0] - vpCenter[0], centroid[1] - vpCenter[1]);

        const tRange = visible ? polylineTRange(chain.polyline, viewport) : null;
        const tStart = tRange ? tRange.tStart : 0;
        const tEnd = tRange ? tRange.tEnd : 1;
        const tFraction = tEnd - tStart;

        const popped = !!chain.graph;
        let fullCost;
        if (popped) {
            fullCost = chain.graph.nodes.length;
        } else {
            fullCost = (chain.nBubbles || 1);
        }
        const clippedCost = Math.ceil(fullCost * tFraction);

        chainInfo.set(chain.id, {
            visible, centroid, distToCenter, popped, fullCost,
            clippedCost, tStart, tEnd,
        });
    }

    let seedId = null;
    let seedDist = Infinity;
    for (const [id, info] of chainInfo) {
        if (!info.visible) continue;
        if (info.distToCenter < seedDist) {
            seedDist = info.distToCenter;
            seedId = id;
        }
    }

    if (seedId === null) return null;

    const activated = new Map();
    const seedInfo = chainInfo.get(seedId);
    const queue = [{ id: seedId, depth: 0, dist: seedInfo.distToCenter }];
    const visited = new Set([seedId]);
    let totalClippedCost = 0;
    let totalFullCost = 0;

    while (queue.length > 0) {
        let bestIdx = 0;
        for (let i = 1; i < queue.length; i++) {
            if (queue[i].dist < queue[bestIdx].dist) bestIdx = i;
        }
        const { id, depth } = queue[bestIdx];
        queue[bestIdx] = queue[queue.length - 1];
        queue.pop();

        const info = chainInfo.get(id);
        if (!info || !info.visible) continue;

        if (totalClippedCost + info.clippedCost > budget && activated.size > 0) {
            continue;
        }

        activated.set(id, {
            depth,
            clippedCost: info.clippedCost,
            fullCost: info.fullCost,
            tStart: info.tStart,
            tEnd: info.tEnd,
            popped: info.popped,
        });
        totalClippedCost += info.clippedCost;
        totalFullCost += info.fullCost;

        const neighbors = adjacency.get(id);
        if (!neighbors) continue;
        for (const nid of neighbors) {
            if (visited.has(nid)) continue;
            visited.add(nid);
            const nInfo = chainInfo.get(nid);
            queue.push({ id: nid, depth: depth + 1, dist: nInfo ? nInfo.distToCenter : Infinity });
        }
    }

    return { seed: seedId, activated, totalClippedCost, totalFullCost, budget };
}
