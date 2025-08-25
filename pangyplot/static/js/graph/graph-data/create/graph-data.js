import deserializeNodes from './graph-element-node.js';
import deserializeLinks from './graph-element-link.js';
import { addNodeRecord, addLinkRecord, getNodeElement, getNodeElements, getLinkElement } from '../graph-manager.js';

//TODO: move responsibility for size to render engine
const NODE_WIDTH=50;
const NODE_LINK_WIDTH=60;
const LINK_LENGTH = 10;
const LINK_WIDTH = 10;
const CHAIN_WIDTH = 35;

const SINGLE_NODE_BP_THRESH = 6;
const KINK_SIZE = 1000;
const MAX_KINKS = 10;

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

function forceGraphNodes(element) {
    let nodes = [];
    var kinks = 1;
    if (element.type !== "bubble:end"){
        kinks = calculateNumberOfKinks(element.seqLength);
    }
    
    for (let i = 0; i < kinks; i++) {
        const { x, y } = getKinkCoordinates(element.coords, kinks, i);
        nodes.push({
            class: "node",
            id: element.id,
            element: element,
            type: element.type,
            nodeId: `${element.id}#${i}`,
            head: () => `${element.id}#0`,
            tail: () => `${element.id}#${kinks - 1}`,
            nodeIdx: i,
            kinks: kinks,
            x, y,
            initX: x,
            initY: y,
            isEnd: (i === 0 || i === kinks - 1),
            isSingleton: kinks === 1,
            isVisible: true,
            isDrawn: true,
            isFixed: false,
            width: NODE_WIDTH,
            annotations: []
        });
    }
    return nodes;
}

function forceGraphNodeLinks(element) {
    let nodeLinks = [];
    var kinks = 1;
    if (element.type !== "bubble:end")
        kinks = calculateNumberOfKinks(element.seqLength);

    for (let i = 1; i < kinks; i++) {

        const source = `${element.id}#${i - 1}`;
        const target =  `${element.id}#${i}`;

        nodeLinks.push({
            class: "node",
            id: element.id,
            element: element,
            type: element.type,
            source: source,
            target: target,
            sourceId: element.id,
            targetId: element.id,
            sourceNodeId: source,
            targetNodeId: target,
            isDrawn: true,
            width: NODE_LINK_WIDTH,
            length: Math.min(element.seqLength / kinks, 1000),
            annotations: [],
            linkId: `${source}+${target}+`
        });
    }
    return nodeLinks;
}

function forceGraphLinks(element) {

    const isChainLink = element.isChainLink;
    const sourceId = element.source.id;
    const targetId = element.target.id;

    const sourceElement = getNodeElements(sourceId)[0];
    const targetElement = getNodeElements(targetId)[0];

    const sourceNodeId = element.fromStrand === "+" ? sourceElement.tail() : sourceElement.head();
    const targetNodeId = element.toStrand === "+" ? targetElement.head() : targetElement.tail();

    var length = LINK_LENGTH;
    if (element.seqLength > 0) {
        length = length * element.seqLength / 10;
    }
    if (element.isDel) {
        length = length * 2;
    }

    return {
        class: "link",
        type: element.type,
        source: sourceNodeId,
        target: targetNodeId,
        element: element,
        sourceId: sourceId,
        sourceNodeId: sourceNodeId,
        targetId: targetId,
        targetNodeId: targetNodeId,
        isDel: element.isDel,
        bubbleId: element.bubbleId, //currently only for del-links
        isVisible: true,
        isDrawn: true,
        length: length,
        width: isChainLink ? CHAIN_WIDTH : LINK_WIDTH,
        contained: element.contained || [],
        annotations: [],
        linkId: `${sourceNodeId}${element.fromStrand}${targetNodeId}${element.toStrand}`
    };
}

function checkExistingNodeRecords(nodeElements) {
    const existingNodes = [];
    const newNodeElements = [];

    for (const nodeElement of nodeElements) {
        const nodes = getNodeElements(nodeElement.id);
        if (nodes.length === 0) {
            newNodeElements.push(nodeElement);
        } else {
            existingNodes.push(...nodes);
        }
    }
    return { existingNodes, newNodeElements };
}

function checkExistingLinkRecords(linkElements) {
    const existingLinks = [];
    const newLinks = [];

    for (const linkElement of linkElements) {
        if (!linkElement.linkId) {
            console.warn("Link element does not have a linkId:", linkElement);
        }
        const link = getLinkElement(linkElement.linkId);
        if (link === null) {
            newLinks.push(linkElement);
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

    const nodeElements = deserializeNodes(rawGraph.nodes);
    const { existingNodes, newNodeElements } = checkExistingNodeRecords(nodeElements);
    const newNodes = newNodeElements.flatMap(forceGraphNodes);
    newNodes.forEach(addNodeRecord);
    const nodes = [...existingNodes, ...newNodes];

    retryFailedLinks(newNodes);

    const nodeLinks = nodeElements.flatMap(forceGraphNodeLinks);
    
    const [linkElements, failedLinks] = deserializeLinks(rawGraph.links);
    const edgeLinks = linkElements.map(forceGraphLinks);
    
    trackFailedLinks(failedLinks);

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