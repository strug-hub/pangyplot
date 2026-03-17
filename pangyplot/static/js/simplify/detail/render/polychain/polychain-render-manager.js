// Detail render pipeline: culling, orchestration.

import { state } from '../../../simplify-state.js';
import { strokeLines, strokePolyline, strokePolylines, strokeSegments } from '../detail-painter.js';
import { buildSegToChains } from '../../data/polychain/polychain-adapter.js';
import { getJunctionNodeById, adjustedJLCoords } from '../../engines/polychain/polychain-hover-engine.js';

function getVisibleChainPolylines(chains) {
    const base = [];
    for (const chain of chains) {
        if (state.poppedChainIds.size > 0 && state.poppedChainIds.has(chain.id)) continue;
        if (chain.polyline.length < 2) continue;
        base.push(chain.polyline);
    }
    return base;
}

function getSelectedPolylines() {
    const polylines = [];
    for (const chain of state.selectedChains) {
        if (state.poppedChainIds.size > 0 && state.poppedChainIds.has(chain.id)) continue;
        if (chain.polyline.length < 2) continue;
        polylines.push(chain.polyline);
    }
    return polylines;
}

export function drawDetail() {
    const ctx = state.ctx;
    const opacity = state.detailOpacity;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const baseWidth = Math.max(1.5, 3 / state.zoom);
    const lineWidth = Math.max(0.8, 1.8 / state.zoom);

    // 1. Junction segment geometry + strand-aware links
    if (!state.hideChainOverlay) {
        const dd = state.detailData;
        const jg = dd.junctionGraph;
        const jls = dd.junctionLinks;
        const hasGraph = jg && jg.nodes.length > 0;
        const hasLinks = jls && jls.length > 0;

        if (hasGraph || hasLinks) {
            if (!dd._segToChains) {
                dd._segToChains = buildSegToChains(dd.junctionSegChains || {}, dd.chains);
            }
            const segToChains = dd._segToChains;
            const popped = state.poppedChainIds;

            // Node lookup (cached) and popped-node set
            const nodeById = getJunctionNodeById() || new Map();
            const poppedNodeIds = new Set();

            // Determine which junction nodes are fully popped
            // (all adjacent chains popped → force nodes replace them)
            if (hasLinks && popped.size > 0) {
                for (const jl of jls) {
                    const chainsA = segToChains[`s${jl.segs[0]}`] || [];
                    const chainsB = segToChains[`s${jl.segs[1]}`] || [];
                    if (chainsA.length > 0 && chainsB.length > 0 &&
                        chainsA.every(c => popped.has(c)) &&
                        chainsB.every(c => popped.has(c))) {
                        // Both ends fully popped — mark junction-graph nodes for culling
                        for (const seg of jl.segs) {
                            const key = `s${seg}`;
                            if (nodeById.has(key)) poppedNodeIds.add(key);
                        }
                    }
                }
            }

            // A. Junction segment geometries (blue)
            if (hasGraph) {
                const visibleSegs = [];
                for (const n of jg.nodes) {
                    if (poppedNodeIds.has(n.id)) continue;
                    visibleSegs.push(n);
                }
                if (visibleSegs.length > 0) {
                    strokeSegments(ctx, visibleSegs, '#0762E5', baseWidth, 0.75 * opacity);
                }
            }

            // B. GFA links between junction segments (gray)
            if (hasGraph && jg.links.length > 0) {
                const gfaLinkCoords = [];
                for (const link of jg.links) {
                    const src = nodeById.get(link.source);
                    const tgt = nodeById.get(link.target);
                    if (!src || !tgt) continue;
                    if (poppedNodeIds.has(link.source) && poppedNodeIds.has(link.target)) continue;
                    // Strand-based endpoint selection
                    const sx = link.from_strand === '+' ? src.x2 : src.x1;
                    const sy = link.from_strand === '+' ? src.y2 : src.y1;
                    const tx = link.to_strand === '+' ? tgt.x1 : tgt.x2;
                    const ty = link.to_strand === '+' ? tgt.y1 : tgt.y2;
                    gfaLinkCoords.push([[sx, sy], [tx, ty]]);
                }
                if (gfaLinkCoords.length > 0) {
                    strokeLines(ctx, gfaLinkCoords, '#969696', lineWidth, 0.7 * opacity);
                }
            }

            // C. Junction links to chain endpoints (proximity-based strand selection)
            // Skip links where both ends are junction graph nodes (handled by step B)
            // Also skip links where one end terminates at a popped chain's endpoint
            // (force graph phantom link replaces this connection).
            // Use coordinate matching rather than segToChains because a segment can
            // be shared between popped and unpopped chains.
            if (hasLinks) {
                // Build set of popped chain polyline endpoint coordinates
                let poppedEndpointKeys = null;
                if (popped.size > 0) {
                    poppedEndpointKeys = new Set();
                    for (const chain of dd.chains) {
                        if (!popped.has(chain.id)) continue;
                        const pl = chain.polyline;
                        if (pl.length >= 2) {
                            poppedEndpointKeys.add(`${Math.round(pl[0][0])},${Math.round(pl[0][1])}`);
                            poppedEndpointKeys.add(`${Math.round(pl[pl.length-1][0])},${Math.round(pl[pl.length-1][1])}`);
                        }
                    }
                }

                const jlCoords = [];
                for (const jl of jls) {
                    const inGraphA = nodeById.has(`s${jl.segs[0]}`);
                    const inGraphB = nodeById.has(`s${jl.segs[1]}`);
                    if (inGraphA && inGraphB) continue; // drawn by GFA links (step B)
                    const adjusted = adjustedJLCoords(jl, nodeById);
                    if (poppedEndpointKeys) {
                        const kA = `${Math.round(adjusted[0][0])},${Math.round(adjusted[0][1])}`;
                        const kB = `${Math.round(adjusted[1][0])},${Math.round(adjusted[1][1])}`;
                        if (poppedEndpointKeys.has(kA) || poppedEndpointKeys.has(kB)) continue;
                    }
                    jlCoords.push(adjusted);
                }
                if (jlCoords.length > 0) {
                    strokeLines(ctx, jlCoords, '#969696', lineWidth, 0.7 * opacity);
                }
            }
        }
    }

    // 3. Chain polylines
    if (!state.hideChainOverlay) {
        const visible = getVisibleChainPolylines(state.detailData.chains);

        if (visible.length > 0) {
            strokePolylines(ctx, visible, '#FF6700', baseWidth, 0.75 * opacity);
        }
    }

    // 4. Selection highlight
    if (state.selectedChains.size > 0) {
        const selected = getSelectedPolylines();
        if (selected.length > 0) {
            strokePolylines(ctx, selected, '#FAB3AE', Math.max(2.5, 5 / state.zoom), 0.9 * opacity);
        }
    }

    // 5. Junction segment hover highlight
    if (state.hoveredJunctionSeg) {
        const n = state.hoveredJunctionSeg;
        strokeSegments(ctx, [n], '#FAB3AE', Math.max(2.5, 5 / state.zoom), 0.9 * opacity);
    }

    // 6. Hover highlight
    if (state.hoveredChain) {
        const pl = state.hoveredChain.polyline;
        if (pl.length >= 2) {
            strokePolyline(ctx, pl, '#fff', Math.max(2.5, 5 / state.zoom), 0.3 * opacity);
        }
    }

    ctx.globalAlpha = 1;
}
