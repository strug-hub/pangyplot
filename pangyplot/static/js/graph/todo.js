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

    if (node.nodeIdx === 0) {
        return start;
    }
    if (nodeData.kinks === 1) {
        return (start + end) / 2;
    }
    if (node.nodeIdx === nodeData.kinks - 1) {
        return end;
    }

    return start + (node.nodeIdx * (end - start)) / (nodeData.kinks - 1);
}


function createNewTextNode(node) {
    let newNode = {
        nodeId: node.nodeId,
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

