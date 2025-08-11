function deduplicateNodes(graphData) {
    const uniqueNodes = new Set();
    graphData.nodes = graphData.nodes.filter(n => {
        if (!uniqueNodes.has(n.nodeId)) {
            uniqueNodes.add(n.nodeId);
            return true;
        }
        return false;
    });
}

function deduplicateLinks(graphData) {
    const uniqueLinks = new Set();
    graphData.links = graphData.links.filter(l => {
        if (!uniqueLinks.has(l.linkId)) {
            uniqueLinks.add(l.linkId);
            return true;
        }
        return false;
    });
}

function removeInvalidLinks(graphData) {
    const nodeSet = new Set(
        graphData.nodes.map(node => node.nodeId)
    );

    graphData.links = graphData.links.filter(l =>
        nodeSet.has(l.sourceNodeId) && nodeSet.has(l.targetNodeId)
    );
}

export function cleanGraph(graphData) {
    deduplicateNodes(graphData);
    deduplicateLinks(graphData);
    removeInvalidLinks(graphData);
}
