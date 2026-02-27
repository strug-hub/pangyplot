import { updateExistingNodeRecords, updateExistingLinkRecords, updateExistingGeneRecords } from '../records-manager-implementation.js';
import { SegmentRecord, BubbleRecord } from "../objects/node-record.js";
import { LinkRecord } from "../objects/link-record.js";
import { createNodeElements, createLinkElements } from './deserializer-element.js';
import recordsManager from '../records-manager.js';
import { GeneRecord } from '../objects/annotation-record.js';
import viewState from '../../view-state.js';

// Create chain links between sibling bubble pairs.
// Only creates forward links (A→next sibling) to avoid duplicates.
// Both records must already be in recordsManager with elements set.
function deserializeChainLinks(nodeRecords) {
    const chainLinks = [];

    for (const record of nodeRecords) {
        if (!record.siblings) continue;
        const nextId = record.siblings[1];
        if (nextId === null || nextId === undefined) continue;

        const targetRecord = recordsManager.getNode("b" + nextId);
        if (!targetRecord || !targetRecord.elements) continue;

        const rawLink = {
            id: `chain_${record.id}_b${nextId}`,
            type: "chain",
            source: record.id,
            target: "b" + nextId,
            from_strand: "+",
            to_strand: "+",
        };
        chainLinks.push(new LinkRecord(rawLink, record, targetRecord));
    }

    return chainLinks;
}

// Scan raw links for source→sink connections within the same bubble.
// These are self-loops (filtered by deserializeLinks) but signal that the bubble is an indel.
// Segments can be shared between sibling bubbles (one's sink = next's source),
// so we map each segment to all bubbles that claim it.
function detectIndelBubbles(rawLinks, bubbleRecords) {
    // Map segId → [{record, role}] (multiple entries for shared boundary segs)
    const segToBubbles = new Map();
    for (const record of bubbleRecords) {
        for (const segId of record.sourceSegs) {
            const key = String(segId);
            if (!segToBubbles.has(key)) segToBubbles.set(key, []);
            segToBubbles.get(key).push({ record, role: "source" });
        }
        for (const segId of record.sinkSegs) {
            const key = String(segId);
            if (!segToBubbles.has(key)) segToBubbles.set(key, []);
            segToBubbles.get(key).push({ record, role: "sink" });
        }
    }

    for (const rawLink of rawLinks) {
        const srcEntries = segToBubbles.get(rawLink.source.slice(1));
        const tgtEntries = segToBubbles.get(rawLink.target.slice(1));
        if (!srcEntries || !tgtEntries) continue;

        // Check if any single bubble claims both endpoints with different roles
        for (const src of srcEntries) {
            for (const tgt of tgtEntries) {
                if (src.record === tgt.record && src.role !== tgt.role) {
                    src.record.isIndel = true;
                }
            }
        }
    }
}

// Remove regular links that connect the same bubble pair as a chain link.
// Chain links take priority since they carry chain ordering semantics.
function deduplicateAgainstChainLinks(linkRecords, chainLinkRecords) {
    const chainPairs = new Set();
    for (const cl of chainLinkRecords) {
        // Chain links are directional (A→next), but GFA links can go either way
        chainPairs.add(`${cl.sourceId}|${cl.targetId}`);
        chainPairs.add(`${cl.targetId}|${cl.sourceId}`);
    }
    return linkRecords.filter(lr => !chainPairs.has(`${lr.sourceId}|${lr.targetId}`));
}

// Deserialize raw s→s links using viewState to resolve visual endpoints.
// Both endpoints must resolve to different records; duplicates are deduplicated.
function deserializeLinks(rawLinks) {
    const seen = new Set();
    const linkRecords = [];

    for (const rawLink of rawLinks) {
        // Raw links are always s→s: source/target are "sN" strings
        const srcSegId = rawLink.source.slice(1); // strip "s" prefix
        const tgtSegId = rawLink.target.slice(1);

        const sourceRecord = viewState.resolve(srcSegId) || recordsManager.getNode("s" + srcSegId);
        const targetRecord = viewState.resolve(tgtSegId) || recordsManager.getNode("s" + tgtSegId);

        if (!sourceRecord || !targetRecord) continue;
        if (sourceRecord === targetRecord) continue;

        const isDel = rawLink.is_deletion || false;
        const key = isDel
            ? [sourceRecord.id, targetRecord.id].sort().join("|")
            : `${sourceRecord.id}|${targetRecord.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Use resolved IDs so sourceId/targetId match the visual nodes
        const resolvedLink = { ...rawLink, source: sourceRecord.id, target: targetRecord.id };
        linkRecords.push(new LinkRecord(resolvedLink, sourceRecord, targetRecord));
    }

    return linkRecords;
}

function deserializeNodes(rawNodes) {
    const records = [];
    for (const rawNode of rawNodes) {
        if (rawNode.type === "segment") {
            records.push(new SegmentRecord(rawNode));
        } else if (rawNode.type === "bubble") {
            records.push(new BubbleRecord(rawNode));
        }
    }
    return records;
}

export function deserializeGraph(rawGraph, parentId = null) {
    // Clear viewState on fresh /select
    if (parentId === null) {
        viewState.clear();
    }

    // Build raw node lookup for viewState registration
    const rawNodeMap = new Map(rawGraph.nodes.map(n => [n.id, n]));

    const newNodeRecords = deserializeNodes(rawGraph.nodes);
    const nodeRecords = updateExistingNodeRecords(newNodeRecords, parentId);

    // Register bubble segments in viewState first
    const bubbleRecords = [];
    if (parentId === null) {
        for (const nodeRecord of nodeRecords) {
            if (nodeRecord.type === "bubble") {
                const rawNode = rawNodeMap.get(nodeRecord.id);
                if (rawNode) {
                    viewState.registerBubble(nodeRecord, rawNode.source_segs || [], rawNode.sink_segs || [], rawNode.inside_segs || []);
                }
                bubbleRecords.push(nodeRecord);
            }
        }
    }

    // Detect indel bubbles before creating elements (affects kink rendering)
    detectIndelBubbles(rawGraph.links, bubbleRecords);

    for (const nodeRecord of nodeRecords) {
        nodeRecord.elements = createNodeElements(nodeRecord);
    }

    const newLinkRecords = deserializeLinks(rawGraph.links);
    const newChainLinkRecords = deserializeChainLinks(nodeRecords);
    const dedupedLinks = deduplicateAgainstChainLinks(newLinkRecords, newChainLinkRecords);
    const linkRecords = updateExistingLinkRecords([...dedupedLinks, ...newChainLinkRecords]);
    for (const linkRecord of linkRecords) {
        linkRecord.elements = createLinkElements(linkRecord);
    }

    return { nodes: nodeRecords, links: linkRecords.filter(l => !l.isIncomplete()) };
}

// Deserializes a flat /pop response into nodeRecords and linkRecords.
export function deserializePopResponse(rawPop, bubbleId) {
    const newNodeRecords = deserializeNodes(rawPop.nodes);
    const nodeRecords = updateExistingNodeRecords(newNodeRecords, bubbleId);

    // Detect indel child bubbles before creating elements
    const childBubbleRecords = nodeRecords.filter(r => r.type === "bubble");
    detectIndelBubbles(rawPop.links, childBubbleRecords);

    for (const nodeRecord of nodeRecords) {
        nodeRecord.elements = createNodeElements(nodeRecord);
    }

    // Capture undo data before expand destroys old mappings
    const oldBubbleRecord = recordsManager.getNode(bubbleId);

    const insideSegs = [];
    for (const [segId, record] of viewState.segmentToNode) {
        if (record === oldBubbleRecord) insideSegs.push(segId);
    }

    const externalLinkSnapshots = recordsManager.getLinks(bubbleId).map(lr => ({
        id: lr.id, sourceId: lr.sourceId, targetId: lr.targetId,
        sourceRecord: lr.sourceRecord, targetRecord: lr.targetRecord,
    }));

    oldBubbleRecord.popData = {
        childBubbles: rawPop.child_bubbles,
        insideSegs,
        externalLinkSnapshots,
    };

    // Expand viewState: unmap the popped bubble, map child bubbles and their inside segs
    viewState.expand(
        oldBubbleRecord,
        rawPop.source_segs,
        rawPop.sink_segs,
        rawPop.child_bubbles,
        (id) => recordsManager.getNode(id)
    );

    // Mark deletion links: direct source→sink links that bypass bubble content
    const sourceSet = new Set((rawPop.source_segs || []).map(String));
    const sinkSet = new Set((rawPop.sink_segs || []).map(String));
    for (const rawLink of rawPop.links) {
        const srcSeg = rawLink.source.slice(1);
        const tgtSeg = rawLink.target.slice(1);
        if ((sourceSet.has(srcSeg) && sinkSet.has(tgtSeg)) ||
            (sinkSet.has(srcSeg) && sourceSet.has(tgtSeg))) {
            rawLink.is_deletion = true;
            rawLink.bubble_id = bubbleId;
        }
    }

    const newLinkRecords = deserializeLinks(rawPop.links);
    const newChainLinkRecords = deserializeChainLinks(nodeRecords);
    const dedupedLinks = deduplicateAgainstChainLinks(newLinkRecords, newChainLinkRecords);
    const allNewLinks = [...dedupedLinks, ...newChainLinkRecords];
    const freshById = new Map(allNewLinks.map(r => [r.id, r]));

    const linkRecords = updateExistingLinkRecords(allNewLinks);
    for (const linkRecord of linkRecords) {
        // Refresh source/target records from the freshly resolved version.
        // updateExistingLinkRecords may return a stale record from /select whose
        // sourceRecord still points to the now-popped bubble — updating here ensures
        // createLinkElements uses the correct (post-expand) node records.
        const fresh = freshById.get(linkRecord.id);
        if (fresh) {
            linkRecord.sourceRecord = fresh.sourceRecord;
            linkRecord.targetRecord = fresh.targetRecord;
        }
        linkRecord.elements = createLinkElements(linkRecord);
    }

    return { nodeRecords, linkRecords: linkRecords.filter(l => !l.isIncomplete()) };
}

export function deserializeGenes(rawGenes) {
    let geneRecords = rawGenes.map(rawGene => new GeneRecord(rawGene));
    geneRecords = updateExistingGeneRecords(geneRecords);
    return geneRecords;
}
