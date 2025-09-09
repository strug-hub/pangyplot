import deserializeNodes from './deserialize-nodes.js';
import deserializeLinks from './deserialize-links.js';
import { updateExistingNodeRecords, updateExistingLinkRecords } from '../records/records-manager.js';

const LINK_SCALE = 1;

const SINGLE_NODE_BP_THRESH = 10;
const KINK_SIZE = 2000;
const MAX_KINKS = 20;

function calculateNumberOfKinks(length) {
    let n = (length < SINGLE_NODE_BP_THRESH) ? 1 : Math.floor(length / KINK_SIZE) + 2;
    return Math.min(n, MAX_KINKS);
}

function getKinkCoordinates(coords, kinks, i = 0) {
    let x, y;

    if (kinks === 1) {
        x = (coords.x1 + coords.x2) / 2;
        y = (coords.y1 + coords.y2) / 2;
    } else {
        let p = 1 - (i / (kinks - 1));
        p = Math.max(0, p);
        p = Math.min(1, p);
        x = p * coords.x1 + (1 - p) * coords.x2;
        y = p * coords.y1 + (1 - p) * coords.y2;
    }

    return { x: x, y: y }
}

function addNodeElements(nodeRecord) {
    if (nodeRecord.nodeElements.length > 0) return;

    let kinks = 1;
    if (nodeRecord.type !== "bubble:end") {
        kinks = calculateNumberOfKinks(nodeRecord.seqLength);
    }

    let nodes = [];

    for (let i = 0; i < kinks; i++) {
        const { x, y } = getKinkCoordinates(nodeRecord.coords, kinks, i);
        nodes.push({
            class: "node",
            id: nodeRecord.id,
            iid: `${nodeRecord.id}#${i}`,
            idx: i,
            record: nodeRecord,
            type: nodeRecord.type,
            head: () => `${nodeRecord.id}#0`,
            tail: () => `${nodeRecord.id}#${kinks - 1}`,
            kinks: kinks,
            x, y,
            initX: x,
            isRef: nodeRecord.ranges.length > 0,
            initY: y,
            isEnd: (i === 0 || i === kinks - 1),
            isSingleton: kinks === 1,
            isVisible: true,
            isDrawn: true,
            width: 5,
            annotations: []
        });
    }

    let nodeLinks = [];

    for (let i = 1; i < kinks; i++) {

        const sourceIid = `${nodeRecord.id}#${i - 1}`;
        const targetIid = `${nodeRecord.id}#${i}`;

        nodeLinks.push({
            class: "node",
            id: nodeRecord.id,
            record: nodeRecord,
            type: nodeRecord.type,
            source: sourceIid,
            target: targetIid,
            sourceIid: sourceIid,
            targetIid: targetIid,
            sourceId: nodeRecord.id,
            targetId: nodeRecord.id,
            isRef: nodeRecord.ranges.length > 0,
            isDrawn: true,
            width: 5,
            length: Math.min(nodeRecord.seqLength / 100, 1000) * LINK_SCALE,
            annotations: [],
            linkIid: `${sourceIid}+${targetIid}+`
        });
    }

    nodeRecord.nodeElements = nodes;
    nodeRecord.linkElements = nodeLinks;
}

export function addLinkElement(linkRecord) {
    if (linkRecord.isIncomplete()) return;
    if (linkRecord.linkElement != null) return;

    const isChainLink = linkRecord.isChainLink;

    const sourceRecord = linkRecord.sourceRecord;
    const targetRecord = linkRecord.targetRecord;

    const isRef = sourceRecord.ranges.length > 0 || targetRecord.ranges.length > 0;

    const sourceIid = linkRecord.fromStrand === "+" ?
        sourceRecord.nodeElements[0].tail() : sourceRecord.nodeElements[0].head();
    const targetIid = linkRecord.toStrand === "+" ? 
        targetRecord.nodeElements[0].head() : targetRecord.nodeElements[0].tail();

    var length = 1;
    if (linkRecord.seqLength > 0) {
        length = Math.min(linkRecord.seqLength / 10, 100);
    }
    if (linkRecord.isDel) {
        length = 2;
    }

    const linkElement = {
        class: "link",
        type: linkRecord.type,
        source: sourceIid,
        target: targetIid,
        sourceIid: sourceIid,
        targetIid: targetIid,
        record: linkRecord,
        sourceId: linkRecord.sourceId,
        targetId: linkRecord.targetId,
        isDel: linkRecord.isDel,
        isRef: isRef,
        bubbleId: linkRecord.bubbleId, //currently only for del-links
        isVisible: true,
        isDrawn: true,
        length: length * LINK_SCALE,
        width: isChainLink ? 5 : 1,
        contained: linkRecord.contained || [],
        annotations: [],
        linkIid: `${sourceIid}${linkRecord.fromStrand}${targetIid}${linkRecord.toStrand}`
    };

    linkRecord.linkElement = linkElement;
}


export function deserializeGraph(rawGraph, parentId = null) {
    const nodes = [];
    const links = [];

    const newNodeRecords = deserializeNodes(rawGraph.nodes);
    const nodeRecords = updateExistingNodeRecords(newNodeRecords, parentId);

    for (const nodeRecord of nodeRecords) {
        addNodeElements(nodeRecord);
        nodes.push(...nodeRecord.nodeElements);
        links.push(...nodeRecord.linkElements);
    }

    const newLinkRecords = deserializeLinks(rawGraph.links);
    const linkRecords = updateExistingLinkRecords(newLinkRecords);
    for (const linkRecord of linkRecords) {
        addLinkElement(linkRecord);
        if (linkRecord.isIncomplete()) continue;
        links.push(linkRecord.linkElement);
    }

    return { nodes, links };
}

export function deserializeBubbleSubgraph(rawBubbleGraph, bubbleId) {

    const bubbleSubgraph = deserializeGraph(rawBubbleGraph.bubble, bubbleId);
    const sourceSubgraph = deserializeGraph(rawBubbleGraph.source, `${bubbleId}:0`);
    const sinkSubgraph = deserializeGraph(rawBubbleGraph.sink, `${bubbleId}:1`);

    return { bubble:bubbleSubgraph, source:sourceSubgraph, sink:sinkSubgraph };
}