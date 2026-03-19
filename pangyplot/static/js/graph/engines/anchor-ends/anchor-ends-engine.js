import eventBus from '@event-bus';

function anchorEndpointNodes(forceGraph) {
    const outgoing = new Set();
    const incoming = new Set();

    for (const link of forceGraph.graphData().links) {
        // Skip GFA links — only chain links and internal kink-to-kink links
        // define terminal status. GFA links can create spurious cross-chain
        // connections that prevent true edge nodes from being anchored.
        if (link.class === "link" && link.type !== "chain") continue;
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
