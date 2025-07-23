var NODEIDS = {};
var NODE_INFO = {};

const KINK_SIZE = 100;
const MAX_KINKS = 10;
const NODE_WIDTH=50;

const SINGLE_NODE_THRESH = 6;

function nodeSourceId(nodeid){
    return NODEIDS[nodeid][NODEIDS[nodeid].length-1];
}
function nodeTargetId(nodeid){
    return NODEIDS[nodeid][0];
}

function filterBadLinks(rawLinks){
    return rawLinks.filter(l => l.source in NODEIDS && l.target in NODEIDS )
}

function getNodeInformation(nodeid){
    return NODE_INFO[nodeid];
}

function nodeidSplit(__nodeid){
    return __nodeid.split("#")[0];
}

function countNodeKinks(nodeid){
    return NODEIDS[nodeid].length;
}

function addLerp(node, dx, dy, duration = 10) {
    if (!node.lerps) node.lerps = [];

    node.lerps.push({
        dx,
        dy,
        t: 0,
        duration
    });
}

function applyNodeLerps(nodes) {
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    for (const node of nodes) {
        if (!node.lerps || node.lerps.length === 0) continue;

        const remainingLerps = [];

        for (const lerp of node.lerps) {
            const progress = Math.min(lerp.t / lerp.duration, 1);
            const easedProgress = easeOutCubic(progress);
            const previousProgress = easeOutCubic((lerp.t - 1) / lerp.duration);
            
            const stepX = lerp.dx * (easedProgress - previousProgress);
            const stepY = lerp.dy * (easedProgress - previousProgress);

            node.x += stepX;
            node.y += stepY;

            lerp.t += 1;
            if (lerp.t < lerp.duration) {
                remainingLerps.push(lerp);
            }
        }

        node.lerps = remainingLerps.length > 0 ? remainingLerps : undefined;
    }
}

function calculateEffectiveNodePosition(node){
    if (!node.hasOwnProperty("start")){
        return null;
    }
    const start = node.start;
    const end = node.end;
    const n = countNodeKinks(node.nodeid);
    const i = node.__nodeidx;

    if (n === 1){
        return (start+end)/2;
    }
    if (i === n-1){
        return end;
    }

    return (start + i*(end-start)/(n-1));
}

function calculateEffectiveNodeStep(node, step){
    if (!node.hasOwnProperty("range")){
        return null;
    }
    let matchedRange = null;
    for (const [rangeStart, rangeEnd] of node.range_inclusive) {
        if (step >= rangeStart && step <= rangeEnd) {
            matchedRange = [rangeStart, rangeEnd];
            break;
        }
    }

    if (!matchedRange) {
        return null;  // No matching range found
    }

    const [start, end] = matchedRange;
    const n = countNodeKinks(node.nodeid);
    const i = node.__nodeidx;

    if (n === 1) {
        return (start + end) / 2;
    }
    if (i === n - 1) {
        return end;
    }

    return start + (i * (end - start)) / (n - 1);
}

function getCoordinates(node, n=1, i=0){
    let x, y;

    if (n === 1) {

        if (node.hasOwnProperty("x") && node.hasOwnProperty("y")) {
            x = node["x"];
            y = node["y"];
        } else {
            x = (node["x1"] + node["x2"]) / 2;
            y = (node["y1"] + node["y2"]) / 2;
        }

    } else {
        let p = 1-(i / (n - 1));
        p = Math.max(0, p);
        p = Math.min(1, p);
        x = p * node["x1"] + (1 - p) * node["x2"];
        y = p * node["y1"] + (1 - p) * node["y2"];
    }

    return {x:x*GLOBAL_MULTIPLIER, y:y*GLOBAL_MULTIPLIER}
}

function getNodeLength(node) {
    if (node.length != null) return node.length;
    if (node.width != null) return node.width;
    return 1;
}

function calculateNumberOfKinks(nodeLength) {
    let n = (nodeLength < SINGLE_NODE_THRESH) ? 1 : Math.floor(nodeLength / KINK_SIZE) + 2;
    return Math.min(n, MAX_KINKS);
}

function createNewNode(node, nodeid, idx, totalKinks) {
    let coords = getCoordinates(node, totalKinks, idx);
    let seqLength = node.length;
    let largestChild = null;

    if (node.type != "segment") {
        largestChild = node.largest_child;
    }

    let newNode = {
        nodeid,
        __nodeid: `${nodeid}#${idx}`,
        __nodeidx: idx,
        uuid: node.uuid,
        class: (idx === 0 || idx === totalKinks - 1) ? "end" : "mid",
        x: coords.x,
        y: coords.y,
        bubble: node.bubble ?? null,
        chain: node.chain ?? null,
        initX: coords.x,
        initY: coords.y,
        type: node.type,
        range: node.range_exclusive ?? [],
        range_inclusive: node.range_inclusive ?? [],
        seqLen: seqLength,
        isHighlight: false,
        isSelected: false,
        isVisible: true,
        isDrawn: true,
        width: NODE_WIDTH,
        children: node.children ?? null,
        largestChild: largestChild,
        isSingleton: totalKinks === 1,
        isRef: node.range_exclusive.length > 0,
        gcCount: node.gc_count,
        annotations: []
    };

    //if (newNode.class == "end" && ! newNode.isSingleton){
    //    newNode.fx = coords.x;
    //    newNode.fy = coords.y;
    //}

    ["chrom", "start", "end", "subtype"].forEach(key => {
        if (node.hasOwnProperty(key)) {
            newNode[key] = node[key];
        }
    });

    return newNode;
}


function createNewNodeLink(node, nodeid, idx, totalKinks, nodeLength) {
    return {
        source: `${nodeid}#${idx - 1}`,
        target: `${nodeid}#${idx}`,
        nodeid,
        isVisible: true,
        isDrawn: true,
        class: "node",
        type: node["type"],
        width: NODE_WIDTH,
        length: Math.min(nodeLength / totalKinks, 1000),
        isRef: node.range.length > 0,
        annotations: []
    };
}

function createNewTextNode(node) {
    let newNode = {
        __nodeid: node.nodeid,
        x: node.x,
        y: node.y,
        class: "text",
        type: node.type,
        text: node.text,
        anchorX: node.x,
        anchorY: node.y,
        isVisible: true,
        isDrawn: true,
    };

    return newNode;
}

function processNodes(rawNodes) {
    let nodes = [];
    let nodeLinks = [];

    rawNodes.forEach(rawNode => {
        const nodeLength = getNodeLength(rawNode);
        const numberOfKinks = calculateNumberOfKinks(nodeLength);
        const nodeid = String(rawNode.nodeid);

        NODEIDS[nodeid] = [];
        NODE_INFO[nodeid] = rawNode;

        for (let i = 0; i < numberOfKinks; i++) {
            const newNode = createNewNode(rawNode, nodeid, i, numberOfKinks);
            nodes.push(newNode);
            NODEIDS[nodeid].push(newNode.__nodeid);

            if (i !== 0) {
                const newLink = createNewNodeLink(newNode, nodeid, i, numberOfKinks, nodeLength);
                nodeLinks.push(newLink);
            }
        }
    });
    
    return { nodes: nodes, nodeLinks: nodeLinks };
}

function anchorEndpointNodes(nodes, links) {
    const outgoing = new Map();
    const incoming = new Map();

    for (const link of links) {
        if (!outgoing.has(link.sourceid)) outgoing.set(link.sourceid, []);
        if (!incoming.has(link.targetid)) incoming.set(link.targetid, []);

        outgoing.get(link.sourceid).push(link);
        incoming.get(link.targetid).push(link);
    }

    for (const node of nodes) {
        const id = node.nodeid;

        const hasOutgoing = outgoing.has(id);
        const hasIncoming = incoming.has(id);

        if (!hasIncoming || !hasOutgoing) {
            node.fx = node.x;
            node.fy = node.y;
        }
    }
}

const XSCALE_NODE = 1
const YSCALE_NODE = 1

function scale_node(node){
    if (node.hasOwnProperty("x") && node.hasOwnProperty("y")) {
        node.x = node.x * XSCALE_NODE;
        node.y = node.y * YSCALE_NODE;
    }
    node.x1 = node.x1 * XSCALE_NODE;
    node.x2 = node.x2 * XSCALE_NODE;
    node.y1 = node.y1 * YSCALE_NODE;
    node.y2 = node.y1 * YSCALE_NODE;
    return node
}
