// Adapter: converts /chain-graph API responses into core PangyPlot elements
// for use in the simplify detail force simulation.

import { deserializeSubgraph } from '../../../../graph/data/records/deserializer/deserialize-subgraph.js';
import simplifyViewState from '../simplify-view-state.js';
import { getForceNodes } from '../force-data.js';
import { addPoppedNodes, absorbPhantom, restorePhantom } from '../../engines/force-engine.js';
import { state } from '../../../simplify-state.js';

// Module-level phantom lookup: chainId → { head: phantomNode, tail: phantomNode }
const chainPhantoms = new Map();

// Module-level seg→phantom lookup: 's' + segId → phantomNode
const segToPhantom = new Map();

/**
 * Get a chain's phantom node by role ('head' or 'tail').
 */
export function getChainPhantom(chainId, role) {
    const entry = chainPhantoms.get(chainId);
    return entry ? entry[role] : null;
}

/**
 * Initialize the always-on junction layer: phantoms at chain endpoints,
 * junction segments as force nodes, and links connecting them.
 * Called once after detailData is set.
 */
export function initJunctionLayer() {
    const dd = state.detailData;
    if (!dd) return;

    chainPhantoms.clear();
    segToPhantom.clear();

    const allNodes = [];
    const allLinks = [];

    // 1. Create phantom nodes for every chain at polyline head/tail
    for (const chain of dd.chains) {
        const pl = chain.polyline;
        if (!pl || pl.length < 2) continue;

        const head = {
            id: `phantom_${chain.id}_head`,
            iid: `phantom_${chain.id}_head`,
            x: pl[0][0], y: pl[0][1],
            fx: pl[0][0], fy: pl[0][1],
            chainId: '__phantom__',
            isPhantom: true,
            phantomRole: 'head',
            phantomChainId: chain.id,
            radius: 0, width: 0,
        };
        const tail = {
            id: `phantom_${chain.id}_tail`,
            iid: `phantom_${chain.id}_tail`,
            x: pl[pl.length - 1][0], y: pl[pl.length - 1][1],
            fx: pl[pl.length - 1][0], fy: pl[pl.length - 1][1],
            chainId: '__phantom__',
            isPhantom: true,
            phantomRole: 'tail',
            phantomChainId: chain.id,
            radius: 0, width: 0,
        };

        chainPhantoms.set(chain.id, { head, tail });
        allNodes.push(head, tail);

        // Map source segs → head phantom, sink segs → tail phantom
        for (const sid of (chain.sourceSegs || [])) {
            segToPhantom.set(`s${sid}`, head);
        }
        for (const sid of (chain.sinkSegs || [])) {
            segToPhantom.set(`s${sid}`, tail);
        }
    }

    // 2. Deserialize ALL junction graph nodes as force nodes
    const jg = dd.junctionGraph;
    const jls = dd.junctionLinks;
    const junctionNodeIdSet = new Set();
    if (jg && jg.nodes.length > 0) {
        for (const n of jg.nodes) junctionNodeIdSet.add(n.id);

        // Only intra-junction links for the subgraph deserializer
        const intraLinks = (jg.links || []).filter(
            l => junctionNodeIdSet.has(l.source) && junctionNodeIdSet.has(l.target)
        );

        const { nodes: jNodes, links: jLinks } = deserializeSubgraph(
            { nodes: jg.nodes, links: intraLinks },
            { tag: { chainId: '__junction__' }, detectIndels: false }
        );

        // Set initial positions from ODGI layout — interpolate kinks along segment geometry
        const rawNodeMap = new Map(jg.nodes.map(n => [n.id, n]));
        // Group kink nodes by record ID to interpolate head→tail
        const kinksByRecord = new Map();
        for (const node of jNodes) {
            if (!kinksByRecord.has(node.id)) kinksByRecord.set(node.id, []);
            kinksByRecord.get(node.id).push(node);
        }
        for (const [recId, kinks] of kinksByRecord) {
            const raw = rawNodeMap.get(recId);
            if (!raw) continue;
            // Sort by kink index (iid = "s123#0", "s123#1", ...)
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
                delete kinks[i].fx;
                delete kinks[i].fy;
            }
        }

        allNodes.push(...jNodes);
        allLinks.push(...jLinks);

        // 3. Cross-boundary links from GFA edges (jg.links has strand info)
        const crossBoundaryLinks = (jg.links || []).filter(
            l => !junctionNodeIdSet.has(l.source) || !junctionNodeIdSet.has(l.target)
        );
        const linkedKinks = new Set();

        for (const gfaLink of crossBoundaryLinks) {
            const inGraphSrc = junctionNodeIdSet.has(gfaLink.source);
            const inGraphTgt = junctionNodeIdSet.has(gfaLink.target);
            const phantomSrc = segToPhantom.get(gfaLink.source);
            const phantomTgt = segToPhantom.get(gfaLink.target);

            if (inGraphSrc && !inGraphTgt && phantomTgt) {
                // Junction seg → chain phantom
                const kink = pickStrandKink(kinksByRecord.get(gfaLink.source), gfaLink.from_strand);
                if (kink) {
                    const key = `${kink.iid}→${phantomTgt.iid}`;
                    if (!linkedKinks.has(key)) {
                        linkedKinks.add(key);
                        // target is phantom side: store to_strand + endpoint seg ID
                        const tgtSegId = gfaLink.target.replace(/^s/, '');
                        allLinks.push(makeJunctionLink(kink, phantomTgt, null, gfaLink.to_strand, null, tgtSegId));
                    }
                }
            } else if (!inGraphSrc && inGraphTgt && phantomSrc) {
                // Chain phantom → junction seg
                const kink = pickStrandKink(kinksByRecord.get(gfaLink.target), gfaLink.to_strand === '+' ? '-' : '+');
                if (kink) {
                    const key = `${phantomSrc.iid}→${kink.iid}`;
                    if (!linkedKinks.has(key)) {
                        linkedKinks.add(key);
                        // source is phantom side: store from_strand + endpoint seg ID
                        const srcSegId = gfaLink.source.replace(/^s/, '');
                        allLinks.push(makeJunctionLink(phantomSrc, kink, gfaLink.from_strand, null, srcSegId, null));
                    }
                }
            } else if (!inGraphSrc && !inGraphTgt && phantomSrc && phantomTgt && phantomSrc !== phantomTgt) {
                const srcSegId = gfaLink.source.replace(/^s/, '');
                const tgtSegId = gfaLink.target.replace(/^s/, '');
                allLinks.push(makeJunctionLink(phantomSrc, phantomTgt, gfaLink.from_strand, gfaLink.to_strand, srcSegId, tgtSegId));
            }
        }

        // 4. Endpoint-to-endpoint junction links (neither seg in junction graph)
        if (jls && jls.length > 0) {
            for (const jl of jls) {
                const segA = `s${jl.segs[0]}`;
                const segB = `s${jl.segs[1]}`;
                if (junctionNodeIdSet.has(segA) || junctionNodeIdSet.has(segB)) continue;
                const phantomA = segToPhantom.get(segA);
                const phantomB = segToPhantom.get(segB);
                if (phantomA && phantomB && phantomA !== phantomB) {
                    allLinks.push(makeJunctionLink(phantomA, phantomB, null, null, String(jl.segs[0]), String(jl.segs[1])));
                }
            }
        }
    } else if (jls && jls.length > 0) {
        // No junction graph nodes — endpoint-to-endpoint only
        for (const jl of jls) {
            const phantomA = segToPhantom.get(`s${jl.segs[0]}`);
            const phantomB = segToPhantom.get(`s${jl.segs[1]}`);
            if (phantomA && phantomB && phantomA !== phantomB) {
                allLinks.push(makeJunctionLink(phantomA, phantomB, null, null, String(jl.segs[0]), String(jl.segs[1])));
            }
        }
    }

    if (allNodes.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }
}

/**
 * Pick the kink node at the strand-appropriate end of a segment.
 * '+' strand → tail (last kink, at x2/y2), '-' strand → head (first kink, at x1/y1).
 * Kinks must already be sorted by index (from initJunctionLayer's kinksByRecord).
 */
function pickStrandKink(kinks, strand) {
    if (!kinks || kinks.length === 0) return null;
    return strand === '+' ? kinks[kinks.length - 1] : kinks[0];
}

/**
 * @param {string} [sourceStrand] - GFA strand for the source side ('+' = tail, '-' = head)
 * @param {string} [targetStrand] - GFA strand for the target side
 * @param {string} [sourceSegId] - chain endpoint seg ID for source side (for viewState resolution)
 * @param {string} [targetSegId] - chain endpoint seg ID for target side
 */
function makeJunctionLink(source, target, sourceStrand, targetStrand, sourceSegId, targetSegId) {
    return {
        source, target,
        isInterChain: true,
        isKinkLink: false,
        chainId: null,
        length: 10,
        sourceStrand: sourceStrand || null,
        targetStrand: targetStrand || null,
        sourceSegId: sourceSegId || null,
        targetSegId: targetSegId || null,
    };
}

// Saved phantoms for restoration on unpop: chainId → { head: phantomNode, tail: phantomNode, headAnchor, tailAnchor }
const absorbedPhantoms = new Map();

/**
 * After popping a chain, absorb its phantoms: rewire all junction links
 * from the phantom to the co-located anchor node, then remove the phantom.
 */
export function absorbChainsPhantoms(chainId, forceNodes) {
    const phantoms = chainPhantoms.get(chainId);
    if (!phantoms) return;

    // Find anchor nodes for this chain (source → head phantom, sink → tail phantom)
    let headAnchor = null, tailAnchor = null;
    for (const n of forceNodes) {
        if (n.chainId !== chainId || !n.isAnchor) continue;
        if (n.anchorRole === 'source') headAnchor = n;
        else if (n.anchorRole === 'sink') tailAnchor = n;
        else if (n.anchorRole === 'source+sink') { headAnchor = n; tailAnchor = n; }
    }

    const saved = { head: null, tail: null, headAnchor, tailAnchor };
    if (headAnchor) {
        saved.head = absorbPhantom(phantoms.head.iid, headAnchor);
    }
    if (tailAnchor && tailAnchor !== headAnchor) {
        saved.tail = absorbPhantom(phantoms.tail.iid, tailAnchor);
    }
    absorbedPhantoms.set(chainId, saved);
}

/**
 * After unpopping a chain, restore its phantoms and rewire links back.
 */
export function restoreChainsPhantoms(chainId) {
    const saved = absorbedPhantoms.get(chainId);
    if (!saved) return;
    absorbedPhantoms.delete(chainId);

    if (saved.tail && saved.tailAnchor) {
        restorePhantom(saved.tail, saved.tailAnchor);
    }
    if (saved.head && saved.headAnchor) {
        restorePhantom(saved.head, saved.headAnchor);
    }
}

/**
 * Build a lookup from segment ID → chain IDs, combining junctionSegChains
 * (naked segments) with chain source/sink seg ownership (endpoint segments).
 */
export function buildSegToChains(junctionSegChains, chains) {
    const map = {};
    for (const [key, val] of Object.entries(junctionSegChains)) {
        map[key] = val;
    }
    for (const chain of chains) {
        for (const sid of (chain.sourceSegs || [])) {
            const key = `s${sid}`;
            if (!map[key]) map[key] = [];
            if (!map[key].includes(chain.id)) map[key].push(chain.id);
        }
        for (const sid of (chain.sinkSegs || [])) {
            const key = `s${sid}`;
            if (!map[key]) map[key] = [];
            if (!map[key].includes(chain.id)) map[key].push(chain.id);
        }
    }
    return map;
}

/**
 * Convert a /chain-graph API response into augmented core elements
 * suitable for the simplify force simulation.
 */
export function deserializeChainGraph(apiData, chain, clipRange) {
    const { nodes: allNodes, links: allLinks, recordMap } = deserializeSubgraph(apiData, {
        tag: { chainId: chain.id },
    });

    // Register bubble segments in simplify viewState
    const rawNodeMap = new Map(apiData.nodes.map(n => [n.id, n]));
    for (const [id, record] of recordMap) {
        if (record.type !== 'bubble') continue;
        const rawNode = rawNodeMap.get(id);
        if (rawNode) {
            simplifyViewState.registerBubble(
                record,
                rawNode.source_segs || [],
                rawNode.sink_segs || [],
                rawNode.inside_segs || [],
            );
        }
    }

    if (chain.polyline.length >= 2 && allNodes.length > 0) {
        pinAnchors(allNodes, chain.polyline);

        // Create links from anchor kink nodes to chain phantoms
        const phantoms = chainPhantoms.get(chain.id);
        if (phantoms) {
            const nodesByRecord = new Map();
            for (const node of allNodes) {
                if (!nodesByRecord.has(node.id)) nodesByRecord.set(node.id, []);
                nodesByRecord.get(node.id).push(node);
            }
            const recIds = [...nodesByRecord.keys()];
            const firstRec = recIds[0];
            const lastRec = recIds[recIds.length - 1];

            if (firstRec) {
                const head = nodesByRecord.get(firstRec)[0];
                allLinks.push(makeJunctionLink(head, phantoms.head));
            }
            if (lastRec) {
                const kinks = nodesByRecord.get(lastRec);
                const tail = kinks[kinks.length - 1];
                if (lastRec !== firstRec || kinks.length > 1) {
                    allLinks.push(makeJunctionLink(tail, phantoms.tail));
                }
            }
        }
    }

    return { nodes: allNodes, links: allLinks };
}

function pinAnchors(nodes, polyline) {
    const plStart = polyline[0];
    const plEnd = polyline[polyline.length - 1];

    const nodesByRecord = new Map();
    for (const node of nodes) {
        if (!nodesByRecord.has(node.id)) nodesByRecord.set(node.id, []);
        nodesByRecord.get(node.id).push(node);
    }

    const recIds = [...nodesByRecord.keys()];
    const firstRec = recIds[0];
    const lastRec = recIds[recIds.length - 1];

    if (firstRec) {
        const head = nodesByRecord.get(firstRec)[0];
        head.fx = plStart[0];
        head.fy = plStart[1];
        head.isAnchor = true;
        head.anchorRole = 'source';
        head.anchorRecord = head.record;
    }
    if (lastRec) {
        const kinks = nodesByRecord.get(lastRec);
        const tail = kinks[kinks.length - 1];
        if (lastRec !== firstRec || kinks.length > 1) {
            tail.fx = plEnd[0];
            tail.fy = plEnd[1];
            tail.isAnchor = true;
            tail.anchorRole = 'sink';
            tail.anchorRecord = tail.record;
        } else {
            tail.anchorRole = 'source+sink';
        }
    }
}
