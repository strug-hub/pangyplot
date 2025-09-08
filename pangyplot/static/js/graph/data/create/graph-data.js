import deserializeNodes from './graph-node-data.js';
import deserializeLinks from './graph-link-data.js';
import { addNodeRecord, addLinkRecord, getNodeElement, getNodeElements, getLinkElement } from '../graph-manager.js';

const LINK_SCALE = 1;

const SINGLE_NODE_BP_THRESH = 10;
const KINK_SIZE = 2000;
const MAX_KINKS = 20;

function calculateNumberOfKinks(length) {
    let n = (length < SINGLE_NODE_BP_THRESH) ? 1 : Math.floor(length / KINK_SIZE) + 2;
    return Math.min(n, MAX_KINKS);
}

function getKinkCoordinates(coords, kinks, i=0){
    let x, y;

    if (kinks === 1) {
        x = (coords.x1 + coords.x2) / 2;
        y = (coords.y1 + coords.y2) / 2;
    } else {
        let p = 1-(i / (kinks - 1));
        p = Math.max(0, p);
        p = Math.min(1, p);
        x = p * coords.x1 + (1 - p) * coords.x2;
        y = p * coords.y1 + (1 - p) * coords.y2;
    }

    return {x:x, y:y}
}

function forceGraphNodes(data) {
    let nodes = [];
    var kinks = 1;
    if (data.type !== "bubble:end"){
        kinks = calculateNumberOfKinks(data.seqLength);
    }
    
    for (let i = 0; i < kinks; i++) {
        const { x, y } = getKinkCoordinates(data.coords, kinks, i);
        nodes.push({
            class: "node",
            id: data.id,
            iid: `${data.id}#${i}`,
            idx: i,
            data: data,
            type: data.type,
            head: () => `${data.id}#0`,
            tail: () => `${data.id}#${kinks - 1}`,
            kinks: kinks,
            x, y,
            initX: x,
            isRef: data.ranges.length > 0,
            initY: y,
            isEnd: (i === 0 || i === kinks - 1),
            isSingleton: kinks === 1,
            isVisible: true,
            isDrawn: true,
            width: 5,
            annotations: []
        });
    }
    return nodes;
}

function forceGraphNodeLinks(data) {
    let nodeLinks = [];
    var kinks = 1;
    if (data.type !== "bubble:end")
        kinks = calculateNumberOfKinks(data.seqLength);

    for (let i = 1; i < kinks; i++) {

        const sourceIid = `${data.id}#${i - 1}`;
        const targetIid = `${data.id}#${i}`;

        nodeLinks.push({
            class: "node",
            id: data.id,
            data: data,
            type: data.type,
            source: sourceIid,
            target: targetIid,
            sourceId: data.id,
            targetId: data.id,
            isRef: data.ranges.length > 0,
            sourceIid: sourceIid,
            targetIid: targetIid,
            isDrawn: true,
            width: 5,
            length: Math.min(data.seqLength/100, 1000)*LINK_SCALE,
            annotations: [],
            linkIid: `${sourceIid}+${targetIid}+`
        });
    }
    return nodeLinks;
}

function forceGraphLinks(data) {

    const isChainLink = data.isChainLink;
    const sourceId = data.source.id;
    const targetId = data.target.id;

    const sourceElement = getNodeElements(sourceId)[0];
    const targetElement = getNodeElements(targetId)[0];

    const isRef = sourceElement.data.ranges.length > 0 || targetElement.data.ranges.length > 0;

    const sourceIid = data.fromStrand === "+" ? sourceElement.tail() : sourceElement.head();
    const targetIid = data.toStrand === "+" ? targetElement.head() : targetElement.tail();

    var length = 1;
    if (data.seqLength > 0) {
        length = Math.min(data.seqLength/10, 100);
    }
    if (data.isDel) {
        length = 2;
    }

    return {
        class: "link",
        type: data.type,
        source: sourceIid,
        target: targetIid,
        data: data,
        sourceId: sourceId,
        sourceIid: sourceIid,
        targetId: targetId,
        targetIid: targetIid,
        isDel: data.isDel,
        isRef: isRef,
        bubbleId: data.bubbleId, //currently only for del-links
        isVisible: true,
        isDrawn: true,
        length: length * LINK_SCALE,
        width: isChainLink ? 5 : 1,
        contained: data.contained || [],
        annotations: [],
        linkIid: `${sourceIid}${data.fromStrand}${targetIid}${data.toStrand}`
    };
}

function checkExistingNodeRecords(nodeData) {
    const existingNodes = [];
    const newNodeData = [];

    for (const nd of nodeData) {
        const nodes = getNodeElements(nd.id);
        if (nodes.length === 0) {
            newNodeData.push(nd);
        } else {
            existingNodes.push(...nodes);
        }
    }
    return { existingNodes, newNodeData };
}

function checkExistingLinkRecords(links) {
    const existingLinks = [];
    const newLinks = [];

    for (const link of links) {
        const existingLink = getLinkElement(link.linkIid);
        if (existingLink === null) {
            newLinks.push(link);
        } else {
            existingLinks.push(link);
        }
    }
    return { existingLinks, newLinks };
}

// A link may have a source or target that is not yet seen.
// When new nodes are added, we try to recover those links.
const linkRetryDict = new Map();
function trackFailedLinks(failedLinks) {
    for (const rawLink of failedLinks) {
        const sourceElement = getNodeElement(rawLink.source);
        //const targetElement = getNodeElement(rawLink.target);
        const missingId = !sourceElement ? rawLink.source : rawLink.target;
        if (!linkRetryDict.has(missingId)) {
            linkRetryDict.set(missingId, new Map());
        }
        linkRetryDict.get(missingId).set(rawLink.id, rawLink);
    }
}

function retryFailedLinks(newNodes) {
    const allRefailedLinks = [];

    for (const node of newNodes) {
        if (!linkRetryDict.has(node.id)) continue;
        const failedLinksMap = linkRetryDict.get(node.id);

        const [linkElements, refailedLinks] = deserializeLinks([...failedLinksMap.values()]);
        const links = linkElements.map(forceGraphLinks);
        allRefailedLinks.push(...refailedLinks);

        const { existingLinks, newLinks } = checkExistingLinkRecords(links);
        
        newLinks.forEach(addLinkRecord);
        linkRetryDict.delete(node.id);
    }
    trackFailedLinks(allRefailedLinks)
}

export default function buildGraphData(rawGraph) {

    const nodeData = deserializeNodes(rawGraph.nodes);
    const { existingNodes, newNodeData } = checkExistingNodeRecords(nodeData);
    const newNodes = newNodeData.flatMap(forceGraphNodes);
    newNodes.forEach(addNodeRecord);
    const nodes = [...existingNodes, ...newNodes];

    retryFailedLinks(newNodes);

    const nodeLinks = nodeData.flatMap(forceGraphNodeLinks);

    const [linkData, failedLinkData] = deserializeLinks(rawGraph.links);
    const edgeLinks = linkData.map(forceGraphLinks);

    trackFailedLinks(failedLinkData);

    const { existingLinks: existingNodeLinks, newLinks: newNodeLinks } = checkExistingLinkRecords(nodeLinks);
    newNodeLinks.forEach(addLinkRecord);

    const { existingLinks: existingEdgeLinks, newLinks: newEdgeLinks } = checkExistingLinkRecords(edgeLinks);
    newEdgeLinks.forEach(addLinkRecord);
    
    const links = [
        ...existingNodeLinks,
        ...newNodeLinks,
        ...existingEdgeLinks,
        ...newEdgeLinks
    ];

    return {nodes, links};
}