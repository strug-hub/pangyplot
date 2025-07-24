import deserializeNodes from './graph-element-node.js';
import deserializeLinks from './graph-element-link.js';

//TODO: move responsibility for size to render engine
const NODE_WIDTH=50;
const NODE_LINK_WIDTH=60;
const LINK_LENGTH = 10
const LINK_WIDTH = 10
const CHAIN_WIDTH = 35;


const SINGLE_NODE_BP_THRESH = 6;
const KINK_SIZE = 100;
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
    const kinks = calculateNumberOfKinks(element.seqLength);

    for (let i = 0; i < kinks; i++) {
        const { x, y } = getKinkCoordinates(element.coords, kinks, i);
        nodes.push({
            class: "node",
            id: element.id,
            element: element,
            type: element.type,
            nodeid: `${element.id}#${i}`,
            head: () => `${element.id}#0`,
            tail: () => `${element.id}#${kinks - 1}`,
            nodeidx: i,
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
    const kinks = calculateNumberOfKinks(element.seqLength);
    for (let i = 1; i < kinks; i++) {
        nodeLinks.push({
            class: "node",
            id: element.id,
            element: element,
            type: element.type,
            source: `${element.id}#${i - 1}`,
            target: `${element.id}#${i}`,
            isVisible: true,
            isDrawn: true,
            width: NODE_LINK_WIDTH,
            length: Math.min(element.seqLength / kinks, 1000),
            annotations: []
        });
    }
    return nodeLinks;
}

function forceGraphLinks(element, headDict, tailDict) {
    const isChainLink = element.isChainLink;
    const sourceId = element.source.id;
    const targetId = element.target.id;
    const sourceNodeId = element.fromStrand === "+" ? tailDict[sourceId] : headDict[sourceId];
    const targetNodeId = element.toStrand === "+" ? headDict[targetId] : tailDict[targetId];

    return {
        class: "link",
        type: isChainLink ? "chain" : "link",
        source: sourceNodeId,
        target: targetNodeId,
        element: element,
        sourceId: sourceId,
        targetId: targetId,
        isDel: element.isDel,
        isVisible: true,
        isDrawn: true,
        length: element.isDel ? LINK_LENGTH * 2 : LINK_LENGTH,
        width: isChainLink ? CHAIN_WIDTH : LINK_WIDTH,
        annotations: []
    };

}

export default function buildGraphData(rawGraph) {

    const nodeElements = deserializeNodes(rawGraph.nodes);
    const nodes = nodeElements.flatMap(element => forceGraphNodes(element));
    const nodeLinks = nodeElements.flatMap(element => forceGraphNodeLinks(element));

    const elementDict = Object.fromEntries(nodeElements.map(e => [e.id, e]));

    const validRawLinks = rawGraph.links.filter(l => (l.source in elementDict) && (l.target in elementDict));
    const linkElements = deserializeLinks(validRawLinks, elementDict);

    const headDict = Object.fromEntries(nodes.map(e => [e.id, e.head()]));
    const tailDict = Object.fromEntries(nodes.map(e => [e.id, e.tail()]));

    const links = [
        ...linkElements.map(link => forceGraphLinks(link, headDict, tailDict)),
        ...nodeLinks
    ];
    
    return {nodes, links};
}