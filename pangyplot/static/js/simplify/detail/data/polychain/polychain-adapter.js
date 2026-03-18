// Adapter: converts /chain-graph API responses into core PangyPlot elements
// for use in the simplify detail force simulation.

import { deserializeSubgraph } from '../../../../graph/data/records/deserializer/deserialize-subgraph.js';
import simplifyViewState from '../simplify-view-state.js';
import { getForceNodes, getForceLinks } from '../force-data.js';
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

    // 2. Deserialize junction graph nodes + ALL links (with phantom linkResolver)
    const jg = dd.junctionGraph;
    const jls = dd.junctionLinks;
    const junctionNodeIdSet = new Set();
    if (jg && jg.nodes.length > 0) {
        for (const n of jg.nodes) junctionNodeIdSet.add(n.id);

        // Build phantom record wrappers for link resolution
        const phantomRecords = new Map();
        for (const [, phantoms] of chainPhantoms) {
            phantomRecords.set(phantoms.head.iid, makePhantomRecord(phantoms.head));
            phantomRecords.set(phantoms.tail.iid, makePhantomRecord(phantoms.tail));
        }

        // Build segToChainPhantom for non-endpoint segs (from junctionSegChains).
        // Uses geometric proximity to the linked junction node to pick head vs tail.
        const segToChainPhantom = new Map();
        const jscMap = dd.junctionSegChains || {};
        const junctionNodePosMap = new Map(jg.nodes.map(n => [n.id, n]));
        for (const rawLink of (jg.links || [])) {
            const sId = typeof rawLink.source === 'string' ? rawLink.source : `s${rawLink.source}`;
            const tId = typeof rawLink.target === 'string' ? rawLink.target : `s${rawLink.target}`;
            for (const [segId, otherSegId] of [[sId, tId], [tId, sId]]) {
                if (segToPhantom.has(segId) || segToChainPhantom.has(segId)) continue;
                if (junctionNodeIdSet.has(segId)) continue;
                const chainIds = jscMap[segId];
                if (!chainIds || chainIds.length === 0) continue;
                const otherNode = junctionNodePosMap.get(otherSegId);
                for (const cid of chainIds) {
                    const phantoms = chainPhantoms.get(cid);
                    if (!phantoms) continue;
                    let phantom;
                    if (otherNode) {
                        const refX = (otherNode.x1 + otherNode.x2) / 2;
                        const refY = (otherNode.y1 + otherNode.y2) / 2;
                        const dH = Math.hypot(refX - phantoms.head.x, refY - phantoms.head.y);
                        const dT = Math.hypot(refX - phantoms.tail.x, refY - phantoms.tail.y);
                        phantom = dH <= dT ? phantoms.head : phantoms.tail;
                    } else {
                        phantom = phantoms.head;
                    }
                    segToChainPhantom.set(segId, phantomRecords.get(phantom.iid));
                    break;
                }
            }
        }

        // Deserialize junction nodes + ALL links with phantom linkResolver
        const { nodes: jNodes, links: jLinks } = deserializeSubgraph(
            { nodes: jg.nodes, links: jg.links || [] },
            {
                tag: { chainId: '__junction__' },
                detectIndels: false,
                linkResolver: (segId) => {
                    const phantom = segToPhantom.get(segId);
                    if (phantom) return phantomRecords.get(phantom.iid);
                    return segToChainPhantom.get(segId) || null;
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
                kinks[i].fx = kinks[i].x;
                kinks[i].fy = kinks[i].y;
            }
        }

        allNodes.push(...jNodes);

        // Post-process: tag cross-boundary links with isInterChain + seg IDs.
        // Match created inter-node links to raw links by processing in same order
        // (deserializeSubgraph creates links in raw-link order, skipping unresolvable).
        const interNodeLinks = jLinks.filter(l => !l.isKinkLink);
        let createdIdx = 0;
        for (const rawLink of (jg.links || [])) {
            const sId = typeof rawLink.source === 'string' ? rawLink.source : `s${rawLink.source}`;
            const tId = typeof rawLink.target === 'string' ? rawLink.target : `s${rawLink.target}`;

            // Replicate resolution check: local record OR phantom resolver
            const sLocal = junctionNodeIdSet.has(sId);
            const tLocal = junctionNodeIdSet.has(tId);
            const sPhantom = !sLocal && (segToPhantom.has(sId) || segToChainPhantom.has(sId));
            const tPhantom = !tLocal && (segToPhantom.has(tId) || segToChainPhantom.has(tId));
            if (!(sLocal || sPhantom) || !(tLocal || tPhantom)) continue;

            const link = interNodeLinks[createdIdx++];
            if (!link) break;

            if (sPhantom || tPhantom) {
                link.isInterChain = true;
                link.chainId = null;
                if (sPhantom) {
                    link.sourceSegId = sId.replace(/^s/, '');
                    link.sourceStrand = rawLink.from_strand || null;
                }
                if (tPhantom) {
                    link.targetSegId = tId.replace(/^s/, '');
                    link.targetStrand = rawLink.to_strand || null;
                }
            }
        }

        allLinks.push(...jLinks);

        // 3. Endpoint-to-endpoint junction links (neither seg in junction graph).
        //    These are in junctionLinks but NOT in jg.links, so the linkResolver
        //    above never sees them.  Create phantom-to-phantom links directly.
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

    // 5. Shared-segment links: adjacent chains sharing an endpoint seg
    //    have no GFA edge between them (same seg), so create direct
    //    phantom-to-phantom links based on chain endpoint overlap.
    const seenSharedPairs = new Set();
    for (const chain of dd.chains) {
        for (const sid of (chain.sinkSegs || [])) {
            const key = `s${sid}`;
            // This chain's sink phantom for this seg
            const sinkPhantom = chainPhantoms.get(chain.id)?.tail;
            if (!sinkPhantom) continue;
            // Find other chains that have this seg as a source seg
            for (const other of dd.chains) {
                if (other.id === chain.id) continue;
                if (!(other.sourceSegs || []).includes(sid)) continue;
                const srcPhantom = chainPhantoms.get(other.id)?.head;
                if (!srcPhantom || srcPhantom === sinkPhantom) continue;
                const pairKey = `${sinkPhantom.iid}↔${srcPhantom.iid}`;
                if (seenSharedPairs.has(pairKey)) continue;
                seenSharedPairs.add(pairKey);
                allLinks.push(makeJunctionLink(sinkPhantom, srcPhantom, null, null, String(sid), String(sid)));
            }
        }
    }

    if (allNodes.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }
}

/**
 * Add phantoms + junction nodes for newly added chains only (incremental).
 * Same logic as initJunctionLayer but operates on a subset of chains and
 * merges into existing phantom maps without clearing them.
 * @param {Array} newChains - chain objects to add
 * @param {Object} dd - the full detailData (for junctionGraph, junctionLinks, etc.)
 */
export function addChainsToJunctionLayer(newChains, dd) {
    if (!dd || newChains.length === 0) return;

    const allNodes = [];
    const allLinks = [];

    // 1. Create phantom nodes for new chains
    for (const chain of newChains) {
        if (chainPhantoms.has(chain.id)) continue; // already exists
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

        for (const sid of (chain.sourceSegs || [])) {
            segToPhantom.set(`s${sid}`, head);
        }
        for (const sid of (chain.sinkSegs || [])) {
            segToPhantom.set(`s${sid}`, tail);
        }
    }

    // 2. Shared-segment links between new and existing chains
    const newChainIds = new Set(newChains.map(c => c.id));
    const seenSharedPairs = new Set();
    for (const chain of dd.chains) {
        for (const sid of (chain.sinkSegs || [])) {
            const sinkPhantom = chainPhantoms.get(chain.id)?.tail;
            if (!sinkPhantom) continue;
            for (const other of dd.chains) {
                if (other.id === chain.id) continue;
                // Only create links involving at least one new chain
                if (!newChainIds.has(chain.id) && !newChainIds.has(other.id)) continue;
                if (!(other.sourceSegs || []).includes(sid)) continue;
                const srcPhantom = chainPhantoms.get(other.id)?.head;
                if (!srcPhantom || srcPhantom === sinkPhantom) continue;
                const pairKey = `${sinkPhantom.iid}↔${srcPhantom.iid}`;
                if (seenSharedPairs.has(pairKey)) continue;
                seenSharedPairs.add(pairKey);
                allLinks.push(makeJunctionLink(sinkPhantom, srcPhantom, null, null, String(sid), String(sid)));
            }
        }
    }

    // 3. Junction links (endpoint-to-endpoint) involving new chains
    const jls = dd.junctionLinks;
    if (jls && jls.length > 0) {
        for (const jl of jls) {
            const segA = `s${jl.segs[0]}`;
            const segB = `s${jl.segs[1]}`;
            const phantomA = segToPhantom.get(segA);
            const phantomB = segToPhantom.get(segB);
            if (!phantomA || !phantomB || phantomA === phantomB) continue;
            // Only add if at least one phantom belongs to a new chain
            const aIsNew = newChainIds.has(phantomA.phantomChainId);
            const bIsNew = newChainIds.has(phantomB.phantomChainId);
            if (!aIsNew && !bIsNew) continue;
            allLinks.push(makeJunctionLink(phantomA, phantomB, null, null, String(jl.segs[0]), String(jl.segs[1])));
        }
    }

    if (allNodes.length > 0 || allLinks.length > 0) {
        addPoppedNodes(allNodes, allLinks);
    }
}

/**
 * Remove phantoms and junction data for specific chains.
 * @param {Set<string>} chainIds - chain IDs to remove
 */
export function removeChainsFromJunctionLayer(chainIds) {
    for (const cid of chainIds) {
        const phantoms = chainPhantoms.get(cid);
        if (phantoms) {
            // Clean up segToPhantom entries pointing to these phantoms
            for (const [key, ph] of segToPhantom) {
                if (ph === phantoms.head || ph === phantoms.tail) {
                    segToPhantom.delete(key);
                }
            }
            chainPhantoms.delete(cid);
        }
        absorbedPhantoms.delete(cid);
    }
}

/**
 * Create a lightweight record wrapper for a phantom node, satisfying the
 * NodeRecord interface expected by deserializeSubgraph's linkResolver.
 * Both head() and tail() return the phantom's iid since it's a single point.
 */
function makePhantomRecord(phantom) {
    return {
        id: phantom.id,
        type: 'phantom',
        ranges: [],
        elements: {
            nodes: [{ head: () => phantom.iid, tail: () => phantom.iid }],
        },
    };
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

/**
 * Find junction nodes directly linked to a phantom node.
 */
function junctionNeighborsOf(phantom) {
    const result = [];
    for (const link of getForceLinks()) {
        const other = link.source === phantom ? link.target
                    : link.target === phantom ? link.source
                    : null;
        if (other && other.chainId === '__junction__') result.push(other);
    }
    return result;
}

// Saved phantoms for restoration on unpop
const absorbedPhantoms = new Map();

/**
 * After popping a chain, absorb its phantoms: rewire all junction links
 * from the phantom to the co-located anchor node, then remove the phantom.
 * Also unpin adjacent junction nodes so they join the force layout.
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

    // Unpin junction segments adjacent to the phantoms being absorbed.
    // A junction segment has multiple kinks (same node.id) — unpin all of them.
    const unpinnedJunctions = [];
    const unlockIds = new Set();
    for (const p of [phantoms.head, phantoms.tail]) {
        for (const jn of junctionNeighborsOf(p)) {
            unlockIds.add(jn.id);
        }
    }
    for (const n of forceNodes) {
        if (n.chainId === '__junction__' && unlockIds.has(n.id) && n.fx != null) {
            unpinnedJunctions.push({ node: n, fx: n.fx, fy: n.fy });
            delete n.fx;
            delete n.fy;
        }
    }

    const saved = { head: null, tail: null, headAnchor, tailAnchor, unpinnedJunctions };
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
 * Re-pin any junction nodes that were unpinned during absorption.
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

    // Re-pin junction nodes that were unpinned
    for (const { node, fx, fy } of saved.unpinnedJunctions) {
        node.fx = fx;
        node.fy = fy;
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
    // Build existing record lookup for cross-chain boundary resolution.
    const existingRecords = new Map();
    for (const n of getForceNodes()) {
        if (n.record && !existingRecords.has(n.id) && n.chainId !== '__junction__') {
            existingRecords.set(n.id, n.record);
        }
    }

    const { nodes: allNodes, links: allLinks, recordMap } = deserializeSubgraph(apiData, {
        tag: { chainId: chain.id },
        linkResolver: (segId) => {
            const plainId = segId.startsWith('s') ? segId.slice(1) : segId;
            return simplifyViewState.resolve(plainId) || existingRecords.get(segId) || null;
        },
    });

    // --- Cross-boundary links (BEFORE viewState registration) ---
    // If endpoint segs are shared with an already-popped chain, connect
    // boundary bubbles directly. Must run before registerBubble overwrites
    // the viewState mapping for the shared seg.
    if (chain.polyline.length >= 2 && allNodes.length > 0) {
        const nodesByRecord = new Map();
        for (const node of allNodes) {
            if (!nodesByRecord.has(node.id)) nodesByRecord.set(node.id, []);
            nodesByRecord.get(node.id).push(node);
        }
        const recIds = [...nodesByRecord.keys()];
        const firstRec = recIds[0];
        const lastRec = recIds[recIds.length - 1];

        // Build lookup of existing force nodes (excluding own chain + phantom/junction)
        const existingNodeById = new Map();
        for (const n of getForceNodes()) {
            if (n.chainId === '__phantom__' || n.chainId === '__junction__') continue;
            if (n.chainId === chain.id) continue;
            if (!existingNodeById.has(n.id)) existingNodeById.set(n.id, []);
            existingNodeById.get(n.id).push(n);
        }

        // Source segs: connect existing record's tail → this chain's first record's head
        for (const seg of (chain.sourceSegs || [])) {
            const record = simplifyViewState.resolve(String(seg));
            if (!record) continue;
            const existing = existingNodeById.get(record.id);
            if (!existing || existing.length === 0) continue;
            const headKink = nodesByRecord.get(firstRec)?.[0];
            const extTail = existing.reduce((a, b) => {
                const ai = parseInt(a.iid.split('#')[1]) || 0;
                const bi = parseInt(b.iid.split('#')[1]) || 0;
                return bi > ai ? b : a;
            });
            if (headKink && extTail && headKink !== extTail) {
                allLinks.push({
                    source: extTail, target: headKink,
                    isKinkLink: false, isInterChain: false,
                    type: 'chain', chainId: null, length: 10, width: 3,
                });
            }
        }

        // Sink segs: connect this chain's last record's tail → existing record's head
        for (const seg of (chain.sinkSegs || [])) {
            const record = simplifyViewState.resolve(String(seg));
            if (!record) continue;
            const existing = existingNodeById.get(record.id);
            if (!existing || existing.length === 0) continue;
            const lastKinks = nodesByRecord.get(lastRec);
            const tailKink = lastKinks?.[lastKinks.length - 1];
            const extHead = existing.reduce((a, b) => {
                const ai = parseInt(a.iid.split('#')[1]) || 0;
                const bi = parseInt(b.iid.split('#')[1]) || 0;
                return ai < bi ? a : b;
            });
            if (tailKink && extHead && tailKink !== extHead) {
                allLinks.push({
                    source: tailKink, target: extHead,
                    isKinkLink: false, isInterChain: false,
                    type: 'chain', chainId: null, length: 10, width: 3,
                });
            }
        }
    }

    // Register bubble segments in simplify viewState (AFTER cross-boundary checks)
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

        const nodesByRecord = new Map();
        for (const node of allNodes) {
            if (!nodesByRecord.has(node.id)) nodesByRecord.set(node.id, []);
            nodesByRecord.get(node.id).push(node);
        }
        const recIds = [...nodesByRecord.keys()];
        const firstRec = recIds[0];
        const lastRec = recIds[recIds.length - 1];

        // Create links from anchor kink nodes to chain phantoms.
        // Tagged isAnchorLink so the force sim can apply stronger pull,
        // keeping anchors near the polyline endpoints while phantoms exist.
        const phantoms = chainPhantoms.get(chain.id);
        if (phantoms) {
            if (firstRec) {
                const head = nodesByRecord.get(firstRec)[0];
                const link = makeJunctionLink(head, phantoms.head);
                link.isAnchorLink = true;
                allLinks.push(link);
            }
            if (lastRec) {
                const kinks = nodesByRecord.get(lastRec);
                const tail = kinks[kinks.length - 1];
                if (lastRec !== firstRec || kinks.length > 1) {
                    const link = makeJunctionLink(tail, phantoms.tail);
                    link.isAnchorLink = true;
                    allLinks.push(link);
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
        head.x = plStart[0];
        head.y = plStart[1];
        head.isAnchor = true;
        head.anchorRole = 'source';
        head.anchorRecord = head.record;
    }
    if (lastRec) {
        const kinks = nodesByRecord.get(lastRec);
        const tail = kinks[kinks.length - 1];
        if (lastRec !== firstRec || kinks.length > 1) {
            tail.x = plEnd[0];
            tail.y = plEnd[1];
            tail.isAnchor = true;
            tail.anchorRole = 'sink';
            tail.anchorRecord = tail.record;
        } else {
            tail.anchorRole = 'source+sink';
        }
    }
}
