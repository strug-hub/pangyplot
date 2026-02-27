function deduplicate(graphData) {
    const seen = new Set();
    graphData.nodes = graphData.nodes.filter(n => !seen.has(n.iid) && seen.add(n.iid));
    graphData.links = graphData.links.filter(l => !seen.has(l.iid) && seen.add(l.iid));
}

export function removeInvalidLinks(graphData) {
    const nids = new Set(graphData.nodes.map(n => n.iid));
    graphData.links = graphData.links.filter(l => nids.has(l.sourceIid) && nids.has(l.targetIid));
}

export function sortLinks(graphData) {
  graphData.links.sort((a, b) => {
    if (a.class === "node" && b.class !== "node") return 1;
    if (a.class !== "node" && b.class === "node") return -1;
    return 0;
  });
}

export function cleanUpGraphData(graphData) {
    deduplicate(graphData);
    removeInvalidLinks(graphData);
    sortLinks(graphData);
}
