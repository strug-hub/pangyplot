import { updateExistingNodeRecords, updateExistingLinkRecords } from '../records-manager-implementation.js';
import { SegmentRecord, BubbleRecord, BubbleEndRecord } from "../node-record.js";
import { LinkRecord } from "../link-record.js";
import { createNodeElements, createLinkElements } from './deserializer-element.js';
import { recordsManager } from '../records-manager.js';

function deserializeLinks(rawLinks) {
    const linkRecords = [];

    for (const rawLink of rawLinks) {
        const sourceRecord = recordsManager.getNode(rawLink.source);
        const targetRecord = recordsManager.getNode(rawLink.target);

        linkRecords.push(new LinkRecord(rawLink, sourceRecord, targetRecord));
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
        } else if (rawNode.type === "bubble:end") {
            records.push(new BubbleEndRecord(rawNode));
        }
    }
    return records;
}

export function deserializeGraph(rawGraph, parentId = null) {
    const nodes = [];
    const links = [];

    const newNodeRecords = deserializeNodes(rawGraph.nodes);
    const nodeRecords = updateExistingNodeRecords(newNodeRecords, parentId);

    for (const nodeRecord of nodeRecords) {
        const elements = createNodeElements(nodeRecord);
        nodeRecord.nodeElements = elements.nodes;
        nodeRecord.linkElements = elements.links;
        nodes.push(...nodeRecord.nodeElements);
        links.push(...nodeRecord.linkElements);
    }

    const newLinkRecords = deserializeLinks(rawGraph.links);
    const linkRecords = updateExistingLinkRecords(newLinkRecords);
    for (const linkRecord of linkRecords) {
        const elements = createLinkElements(linkRecord);
        linkRecord.linkElements = elements.links;
        links.push(...linkRecord.linkElements);
    }

    return { nodes, links };
}

export function deserializeBubbleSubgraph(rawBubbleGraph, bubbleId) {

    const bubbleSubgraph = deserializeGraph(rawBubbleGraph.bubble, bubbleId);
    const sourceSubgraph = deserializeGraph(rawBubbleGraph.source, `${bubbleId}:0`);
    const sinkSubgraph = deserializeGraph(rawBubbleGraph.sink, `${bubbleId}:1`);

    return { bubble:bubbleSubgraph, source:sourceSubgraph, sink:sinkSubgraph };
}