// Physics zone debug overlay: center-out chain walk with BFS budget.
// Toggled with L key. Shows which chains would be activated for physics.

import { state } from './simplify-state.js';
import { getViewport } from './viewport.js';

let debugActive = false;
let activationSet = null;
let adjacency = null;          // Map<chainId, Set<chainId>>
let adjacencyDataId = null;    // identity ref to track detailData changes

// Viewport snapshot from last recompute — recompute when center shifts enough
let lastVpCenterX = 0;
let lastVpCenterY = 0;
let lastVpWidth = 0;
let lastZoom = 0;

const DEPTH_COLORS = [
    '#00ffff',  // depth 0 (seed) — cyan
    '#4488ff',  // depth 1 — blue
    '#8844ff',  // depth 2 — purple
    '#cc44ff',  // depth 3+ — magenta
];

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export function togglePhysicsDebug() {
    debugActive = !debugActive;
    state.physicsDebug = debugActive;
    if (debugActive) {
        recompute();
        logActivationSet();
    } else {
        console.log('[physics-zone] OFF');
        activationSet = null;
    }
}

export function isPhysicsDebugActive() {
    return debugActive;
}

export function getActivationSet() {
    if (!debugActive || !state.detailData) return null;
    recomputeIfDirty();
    return activationSet;
}

// ---------------------------------------------------------------
// Adjacency graph (rebuilt when detailData changes)
// ---------------------------------------------------------------

function buildAdjacency(chains, chainAdjacency) {
    const adj = new Map();
    for (const chain of chains) {
        adj.set(chain.id, new Set());
    }

    // 1. Shared boundary segments (sourceSegs/sinkSegs overlap)
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

    // 2. Backend-computed junction adjacency (chains connected through naked
    //    GFA segments that sit between chain endpoints)
    if (chainAdjacency) {
        // JSON keys are always strings; chain.id may be number or string.
        // Build string → actual chain.id lookup.
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
// Chain bounding boxes & centroids
// ---------------------------------------------------------------

function chainBbox(chain) {
    const pl = chain.polyline;
    if (!pl || pl.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pl) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
}

function chainCentroid(bbox) {
    return [(bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2];
}

// ---------------------------------------------------------------
// Viewport clipping: fraction of polyline within viewport
// ---------------------------------------------------------------

function polylineTRange(polyline, vp) {
    if (polyline.length < 2) return null;

    // Compute cumulative arc lengths
    const cumLen = [0];
    for (let i = 1; i < polyline.length; i++) {
        const dx = polyline[i][0] - polyline[i - 1][0];
        const dy = polyline[i][1] - polyline[i - 1][1];
        cumLen.push(cumLen[i - 1] + Math.hypot(dx, dy));
    }
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen === 0) return null;

    // Find the first and last point inside the viewport
    let firstInside = -1, lastInside = -1;
    for (let i = 0; i < polyline.length; i++) {
        const [x, y] = polyline[i];
        if (x >= vp.minX && x <= vp.maxX && y >= vp.minY && y <= vp.maxY) {
            if (firstInside === -1) firstInside = i;
            lastInside = i;
        }
    }

    if (firstInside === -1) {
        // No points inside — check if the polyline crosses the viewport
        // (simple bbox overlap check; if bbox overlaps vp, treat as partially visible)
        const bbox = chainBbox({ polyline });
        if (!bbox) return null;
        if (bbox.maxX < vp.minX || bbox.minX > vp.maxX ||
            bbox.maxY < vp.minY || bbox.minY > vp.maxY) return null;
        // Crossing — use full range as approximation
        return { tStart: 0, tEnd: 1 };
    }

    // Extend one point beyond in each direction for smooth clipping
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

    // Rebuild adjacency if detailData changed
    if (adjacencyDataId !== state.detailData) {
        adjacency = buildAdjacency(chains, chainAdjacency);
        adjacencyDataId = state.detailData;
    }

    // Viewport with 10% margin
    const marginX = (viewport.maxX - viewport.minX) * 0.1;
    const marginY = (viewport.maxY - viewport.minY) * 0.1;
    const vp = {
        minX: viewport.minX - marginX,
        minY: viewport.minY - marginY,
        maxX: viewport.maxX + marginX,
        maxY: viewport.maxY + marginY,
    };

    // Precompute bboxes, centroids, visibility
    const chainInfo = new Map();
    const vpCenter = [
        (viewport.minX + viewport.maxX) / 2,
        (viewport.minY + viewport.maxY) / 2,
    ];

    for (const chain of chains) {
        const bbox = chainBbox(chain);
        if (!bbox) continue;

        // Viewport overlap check (with margin)
        const visible = !(bbox.maxX < vp.minX || bbox.minX > vp.maxX ||
                          bbox.maxY < vp.minY || bbox.minY > vp.maxY);

        const centroid = chainCentroid(bbox);
        const distToCenter = Math.hypot(centroid[0] - vpCenter[0], centroid[1] - vpCenter[1]);

        // Viewport clipping t-range
        const tRange = visible ? polylineTRange(chain.polyline, viewport) : null;
        const tStart = tRange ? tRange.tStart : 0;
        const tEnd = tRange ? tRange.tEnd : 1;
        const tFraction = tEnd - tStart;

        // Cost estimation
        const popped = !!chain.graph;
        let fullCost;
        if (popped) {
            fullCost = chain.graph.nodes.length * 2;
        } else {
            fullCost = (chain.nBubbles || 1) * 3;
        }
        const clippedCost = Math.ceil(fullCost * tFraction);

        chainInfo.set(chain.id, {
            visible,
            centroid,
            distToCenter,
            popped,
            fullCost,
            clippedCost,
            tStart,
            tEnd,
        });
    }

    // Find seed: visible chain closest to viewport center
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

    // BFS walk with budget
    const activated = new Map();
    const queue = [{ id: seedId, depth: 0 }];
    const visited = new Set([seedId]);
    let totalClippedCost = 0;
    let totalFullCost = 0;

    while (queue.length > 0) {
        const { id, depth } = queue.shift();
        const info = chainInfo.get(id);
        if (!info || !info.visible) continue;

        // Check budget
        if (totalClippedCost + info.clippedCost > budget && activated.size > 0) {
            continue; // skip but keep going to try smaller chains
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

        // Enqueue neighbors
        const neighbors = adjacency.get(id);
        if (!neighbors) continue;
        for (const nid of neighbors) {
            if (visited.has(nid)) continue;
            visited.add(nid);
            queue.push({ id: nid, depth: depth + 1 });
        }
    }

    return {
        seed: seedId,
        activated,
        totalClippedCost,
        totalFullCost,
        budget,
    };
}

// ---------------------------------------------------------------
// Internal recompute with viewport-shift threshold
// ---------------------------------------------------------------

function recompute() {
    if (!state.detailData) {
        activationSet = null;
        return;
    }
    const vp = getViewport();
    activationSet = computeActivationSet(
        state.detailData.chains,
        state.detailData.chainAdjacency,
        vp,
        state.PHYSICS_NODE_BUDGET,
    );
    lastVpCenterX = (vp.minX + vp.maxX) / 2;
    lastVpCenterY = (vp.minY + vp.maxY) / 2;
    lastVpWidth = vp.maxX - vp.minX;
    lastZoom = state.zoom;
}

function logActivationSet() {
    if (!activationSet) {
        console.log('[physics-zone] no activation set');
        return;
    }
    const { seed, activated, totalClippedCost, totalFullCost, budget } = activationSet;
    const totalChains = state.detailData?.chains.length || 0;

    // Adjacency dump
    console.groupCollapsed(`[physics-zone] ON — seed: ${seed}, chains: ${activated.size}/${totalChains}, cost: ${totalClippedCost}/${budget}`);

    // Per-chain adjacency
    console.log('--- adjacency ---');
    for (const chain of (state.detailData?.chains || [])) {
        const neighbors = adjacency?.get(chain.id);
        const nList = neighbors ? [...neighbors].join(', ') : '(none)';
        const inSet = activated.has(chain.id);
        const info = inSet ? activated.get(chain.id) : null;
        const tag = inSet ? `depth=${info.depth} cost=${info.clippedCost}` : 'NOT activated';
        console.log(`  ${chain.id}: [${nList}] — ${tag}`);
    }

    // Isolated chains (no neighbors at all)
    const isolated = (state.detailData?.chains || []).filter(c => {
        const n = adjacency?.get(c.id);
        return !n || n.size === 0;
    });
    if (isolated.length > 0) {
        console.log('--- isolated chains (0 neighbors) ---');
        for (const c of isolated) {
            console.log(`  ${c.id}: sourceSegs=[${(c.sourceSegs||[]).join(',')}] sinkSegs=[${(c.sinkSegs||[]).join(',')}]`);
        }
    }

    console.groupEnd();
}

function recomputeIfDirty() {
    if (!state.detailData) { activationSet = null; return; }
    const vp = getViewport();
    const cx = (vp.minX + vp.maxX) / 2;
    const cy = (vp.minY + vp.maxY) / 2;
    const vpW = vp.maxX - vp.minX;

    // Recompute when: detailData changed, or viewport center shifted by >5% of
    // viewport width in either axis, or zoom changed by >10%
    const threshold = (lastVpWidth || vpW) * 0.05;
    const dirty = !activationSet
        || adjacencyDataId !== state.detailData
        || Math.abs(cx - lastVpCenterX) > threshold
        || Math.abs(cy - lastVpCenterY) > threshold
        || Math.abs(state.zoom - lastZoom) / (lastZoom || 1) > 0.1;

    if (dirty) recompute();
}

// ---------------------------------------------------------------
// Rendering (called from render.js within data-space transform)
// ---------------------------------------------------------------

export function drawPhysicsDebugOverlay(ctx, viewport) {
    recomputeIfDirty();
    if (!activationSet || !state.detailData) return;

    const { seed, activated } = activationSet;
    const chains = state.detailData.chains;
    const baseWidth = Math.max(1.5, 3 / state.zoom);

    // --- Dim non-activated chains ---
    for (const chain of chains) {
        if (activated.has(chain.id)) continue;
        const pl = chain.polyline;
        if (!pl || pl.length < 2) continue;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = baseWidth;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) {
            ctx.lineTo(pl[i][0], pl[i][1]);
        }
        ctx.stroke();
    }

    // --- Highlighted activated chains ---
    for (const chain of chains) {
        const info = activated.get(chain.id);
        if (!info) continue;
        const pl = chain.polyline;
        if (!pl || pl.length < 2) continue;

        const colorIdx = Math.min(info.depth, DEPTH_COLORS.length - 1);
        const color = DEPTH_COLORS[colorIdx];
        const width = info.depth === 0 ? baseWidth * 3 : baseWidth * 2;

        // Dashed for non-popped, solid for popped
        if (info.popped) {
            ctx.setLineDash([]);
        } else {
            const dash = Math.max(3, 6 / state.zoom);
            ctx.setLineDash([dash, dash]);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(pl[0][0], pl[0][1]);
        for (let i = 1; i < pl.length; i++) {
            ctx.lineTo(pl[i][0], pl[i][1]);
        }
        ctx.stroke();

        // Glow effect for seed
        if (chain.id === seed) {
            ctx.strokeStyle = color;
            ctx.lineWidth = width * 2;
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.moveTo(pl[0][0], pl[0][1]);
            for (let i = 1; i < pl.length; i++) {
                ctx.lineTo(pl[i][0], pl[i][1]);
            }
            ctx.stroke();
        }
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // --- Viewport center crosshair (data space) ---
    const cx = (viewport.minX + viewport.maxX) / 2;
    const cy = (viewport.minY + viewport.maxY) / 2;
    const armLen = Math.max(5, 10 / state.zoom);

    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = Math.max(1, 2 / state.zoom);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - armLen, cy);
    ctx.lineTo(cx + armLen, cy);
    ctx.moveTo(cx, cy - armLen);
    ctx.lineTo(cx, cy + armLen);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------
// HUD (called from render.js in screen space, after ctx.restore)
// ---------------------------------------------------------------

export function drawPhysicsDebugHUD(ctx, cw) {
    // activationSet already refreshed by drawPhysicsDebugOverlay in the same frame
    if (!activationSet || !state.detailData) return;

    const { seed, activated, totalClippedCost, totalFullCost, budget } = activationSet;
    const totalChains = state.detailData.chains.length;

    const lines = [
        'PHYSICS ZONE',
        `seed: ${seed}`,
        `chains: ${activated.size} / ${totalChains}`,
        `est. nodes: ${totalClippedCost} / ${budget}`,
        `full cost:  ${totalFullCost}`,
    ];

    const fontSize = 11;
    const lineHeight = 16;
    const padding = 8;
    const x = cw - 220;
    const y = 10;
    const boxW = 210;
    const boxH = padding * 2 + lines.length * lineHeight + 20; // extra for legend

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 4);
    ctx.stroke();

    // Text
    ctx.font = `600 ${fontSize}px 'SF Mono', Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i === 0 ? '#00ffff' : '#ccc';
        ctx.fillText(lines[i], x + padding, y + padding + i * lineHeight);
    }

    // Depth legend
    const legendY = y + padding + lines.length * lineHeight + 4;
    const labels = ['0', '1', '2', '3+'];
    let lx = x + padding;
    for (let i = 0; i < DEPTH_COLORS.length; i++) {
        ctx.fillStyle = DEPTH_COLORS[i];
        ctx.beginPath();
        ctx.arc(lx + 5, legendY + 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#999';
        ctx.fillText(labels[i], lx + 12, legendY);
        lx += 40;
    }
}
