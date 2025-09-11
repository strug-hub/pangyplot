const LINK_SCALE = 1;
const LINK_BASE_LENGTH = 10;

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

export function createNodeElements(nodeRecord) {

    let kinks = 1;
    if (nodeRecord.type !== "bubble:end") {
        kinks = calculateNumberOfKinks(nodeRecord.seqLength);
    }

    let nodes = [];

    for (let i = 0; i < kinks; i++) {
        const { x, y } = getKinkCoordinates(nodeRecord.coords, kinks, i);
        nodes.push({
            isNode: true,
            isLink: false,
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
            isNode: false,
            isLink: true,
            class: "node",
            id: nodeRecord.id,
            iid: `${sourceIid}+${targetIid}+`,
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
            annotations: []
        });
    }

    return {nodes: nodes, links: nodeLinks};
}

export function createLinkElements(linkRecord) {
    if (linkRecord.isIncomplete()) 
        return {nodes: [], links: []};

    const isChainLink = linkRecord.isChainLink;

    const sourceRecord = linkRecord.sourceRecord;
    const targetRecord = linkRecord.targetRecord;

    const isRef = sourceRecord.ranges.length > 0 || targetRecord.ranges.length > 0;

    const sourceIid = linkRecord.fromStrand === "+" ?
        sourceRecord.elements.nodes[0].tail() : sourceRecord.elements.nodes[0].head();
    const targetIid = linkRecord.toStrand === "+" ? 
        targetRecord.elements.nodes[0].head() : targetRecord.elements.nodes[0].tail();

    var length = LINK_BASE_LENGTH;
    if (linkRecord.seqLength > 0) {
        length = Math.min(linkRecord.seqLength / 100, 1000) * LINK_SCALE;
    }
    if (linkRecord.isDel) {
        length = LINK_BASE_LENGTH*2;
    }

    const linkElement = {
        isNode: false,
        isLink: true,
        class: "link",
        iid: `${sourceIid}${linkRecord.fromStrand}${targetIid}${linkRecord.toStrand}`,
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
        annotations: []
    };

    return {nodes: [], links: [linkElement]};
}
