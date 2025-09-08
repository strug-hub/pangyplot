function deduplicateNodes(graphData) {
    const uniqueNodes = new Set();
    graphData.nodes = graphData.nodes.filter(n => {
        if (!uniqueNodes.has(n.iid)) {
            uniqueNodes.add(n.iid);
            return true;
        }
        return false;
    });
}

function deduplicateLinks(graphData) {
    const uniqueLinks = new Set();
    graphData.links = graphData.links.filter(l => {
        if (!uniqueLinks.has(l.linkIid)) {
            uniqueLinks.add(l.linkIid);
            return true;
        }
        return false;
    });
}

function removeInvalidLinks(graphData) {
    const nodeSet = new Set(
        graphData.nodes.map(node => node.iid)
    );

    graphData.links = graphData.links.filter(l => {
        return nodeSet.has(l.sourceIid) && nodeSet.has(l.targetIid);
    });
}

export function cleanGraph(graphData) {
    deduplicateNodes(graphData);
    deduplicateLinks(graphData);
    removeInvalidLinks(graphData);
}
