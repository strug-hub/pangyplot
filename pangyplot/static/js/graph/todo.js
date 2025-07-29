


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
