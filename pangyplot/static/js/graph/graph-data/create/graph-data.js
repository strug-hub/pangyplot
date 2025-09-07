import deserializeNodes from './graph-element-node.js';
import deserializeLinks from './graph-element-link.js';
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
            iid: `${element.id}#${i}`,
            idx: i,
            element: element,
            type: element.type,
            head: () => `${element.id}#0`,
            tail: () => `${element.id}#${kinks - 1}`,
            kinks: kinks,
            x, y,
            initX: x,
            isRef: element.ranges.length > 0,
            initY: y,
            isEnd: (i === 0 || i === kinks - 1),
            isSingleton: kinks === 1,
            isVisible: true,
            isDrawn: true,
            isFixed: false,
            width: 5,
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

        const sourceIid = `${element.id}#${i - 1}`;
        const targetIid = `${element.id}#${i}`;

        nodeLinks.push({
            class: "node",
            id: element.id,
            element: element,
            type: element.type,
            source: sourceIid,
            target: targetIid,
            sourceId: element.id,
            targetId: element.id,
            isRef: element.ranges.length > 0,
            sourceIid: sourceIid,
            targetIid: targetIid,
            isDrawn: true,
            width: 5,
            length: Math.min(element.seqLength/100, 1000)*LINK_SCALE,
            annotations: [],
            linkIid: `${sourceIid}+${targetIid}+`
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

    const isRef = sourceElement.element.ranges.length > 0 || targetElement.element.ranges.length > 0;

    const sourceIid = element.fromStrand === "+" ? sourceElement.tail() : sourceElement.head();
    const targetIid = element.toStrand === "+" ? targetElement.head() : targetElement.tail();

    var length = 1;
    if (element.seqLength > 0) {
        length = Math.min(element.seqLength/10, 100);
    }
    if (element.isDel) {
        length = 2;
    }

    return {
        class: "link",
        type: element.type,
        source: sourceIid,
        target: targetIid,
        element: element,
        sourceId: sourceId,
        sourceIid: sourceIid,
        targetId: targetId,
        targetIid: targetIid,
        isDel: element.isDel,
        isRef: isRef,
        bubbleId: element.bubbleId, //currently only for del-links
        isVisible: true,
        isDrawn: true,
        length: length * LINK_SCALE,
        width: isChainLink ? 5 : 1,
        contained: element.contained || [],
        annotations: [],
        linkIid: `${sourceIid}${element.fromStrand}${targetIid}${element.toStrand}`
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
        if (!linkElement.linkIid) {
            console.warn("Link element does not have a linkIid:", linkElement);
        }
        const link = getLinkElement(linkElement.linkIid);
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