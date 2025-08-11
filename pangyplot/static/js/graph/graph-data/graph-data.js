import deserializeNodes from './graph-element-node.js';
import deserializeLinks from './graph-element-link.js';
import { addNodeRecord, addLinkRecord, getNodeElements } from './graph-manager.js';

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
    if (element.type !== "bubble:end")
        kinks = calculateNumberOfKinks(element.seqLength);
    
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
            isHighlight: false,
            isSelected: false,
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
        length = element.length * LINK_LENGTH * 2;
    }

    return {
        class: "link",
        type: isChainLink ? "chain" : "link",
        source: sourceNodeId,
        target: targetNodeId,
        element: element,
        sourceId: sourceId,
        sourceNodeId: sourceNodeId,
        targetId: targetId,
        targetNodeId: targetNodeId,
        isDel: element.isDel,
        isVisible: true,
        isDrawn: true,
        length: length,
        width: isChainLink ? CHAIN_WIDTH : LINK_WIDTH,
        contained: element.contained || [],
        annotations: [],
        linkId: `${sourceNodeId}${element.fromStrand}${targetNodeId}${element.toStrand}`
    };
}
export default function buildGraphData(rawGraph) {

    const nodeElements = deserializeNodes(rawGraph.nodes);
    const nodes = nodeElements.flatMap(element => forceGraphNodes(element));
    nodes.forEach(addNodeRecord);

    const nodeLinks = nodeElements.flatMap(element => forceGraphNodeLinks(element));
    const linkElements = deserializeLinks(rawGraph.links);
    const links = [
        ...linkElements.map(link => forceGraphLinks(link)),
        ...nodeLinks
    ];
    links.forEach(addLinkRecord);

    return {nodes, links};
}