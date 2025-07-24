function calculateEffectiveNodeStep(node, step){
    const nodeData = node.data;
    if (nodeData.ranges.length === 0) {
        return null;
    }
   
    let matchedRange = null;
    for (const [rangeStart, rangeEnd] of nodeData.ranges) {
        if (step >= rangeStart && step <= rangeEnd) {
            matchedRange = [rangeStart, rangeEnd];
            break;
        }
    }

    if (!matchedRange) {
        return null;  // No matching range found
    }

    const [start, end] = matchedRange;

    if (node.nodeidx === 0) {
        return start;
    }
    if (nodeData.kinks === 1) {
        return (start + end) / 2;
    }
    if (node.nodeidx === nodeData.kinks - 1) {
        return end;
    }

    return start + (node.nodeidx * (end - start)) / (nodeData.kinks - 1);
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
