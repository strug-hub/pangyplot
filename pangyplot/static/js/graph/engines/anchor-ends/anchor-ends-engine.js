import eventBus from "../../../utils/event-bus.js";

function anchorEndpointNodes(forceGraph) {
    const outgoing = new Set();
    const incoming = new Set();

    for (const link of forceGraph.graphData().links) {
        outgoing.add(link.sourceIid);
        incoming.add(link.targetIid);
    }

    let anchoredCount = 0;
    for (const node of forceGraph.graphData().nodes) {
        const hasOutgoing = outgoing.has(node.iid);
        const hasIncoming = incoming.has(node.iid);

        if (!hasIncoming || !hasOutgoing) {
            node.fx = node.x;
            node.fy = node.y;
            anchoredCount++;
        }
    }
}

export default function setUpAnchorEndsEngine(forceGraph) {

    eventBus.subscribe("graph:data-replaced", (forceGraph) => {
        anchorEndpointNodes(forceGraph);
    });
}
