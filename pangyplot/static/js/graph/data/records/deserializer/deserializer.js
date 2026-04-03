import { updateExistingNodeRecords, updateExistingLinkRecords, updateExistingGeneRecords, clearRecordsManager } from '../records-manager-implementation.js';
import { createNodeElements, createLinkElements } from './deserializer-element.js';
import recordsManager from '../records-manager.js';
import { GeneRecord } from '../objects/annotation-record.js';
import viewState from '../../view-state.js';
import { deserializeNodes } from './deserialize-nodes.js';
import { deserializeLinks, deserializeChainLinks, deduplicateAgainstChainLinks } from './deserialize-links.js';
import { detectIndelBubbles } from './indel-detection.js';

export function deserializeGraph(rawGraph, parentId = null) {
    // Clear all records and viewState on fresh /select
    if (parentId === null) {
        clearRecordsManager();
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
    const sourceSet = new Set((rawPop.source_segs || []).map(s => `s${s}`));
    const sinkSet = new Set((rawPop.sink_segs || []).map(s => `s${s}`));
    for (const rawLink of rawPop.links) {
        const srcSeg = String(rawLink.source);
        const tgtSeg = String(rawLink.target);
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
    const freshRecords = rawGenes.map(rawGene => new GeneRecord(rawGene));

    // Default non-MANE genes to hidden (if any MANE genes exist in this batch)
    const hasMane = freshRecords.some(r => r.isMane);
    if (hasMane) {
        for (const r of freshRecords) {
            if (!r.isMane) r.setVisibility(false);
        }
    }

    // Swap in existing records (preserves user visibility overrides from prior queries)
    const geneRecords = updateExistingGeneRecords(freshRecords);
    return geneRecords;
}
