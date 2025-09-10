import recordsManager from "../records/records-manager.js";

export function selfDestructLinks(graphData) {
    const nids = new Set(graphData.nodes.map(node => node.iid));

    const selfDestruct = graphData.links.filter(link => 
        link.record.isSelfDestructLink && nids.has(link.sourceIid) && nids.has(link.targetIid));
    
    if (selfDestruct.length === 0) return;

    const removeIds = new Set([
        ...selfDestruct.map(link => link.sourceId), 
        ...selfDestruct.map(link => link.targetId)
    ]);

    for (const id of removeIds) {
        const subgraphRecords = recordsManager.getChildSubgraph(id);
        const { nodes, links } = recordsManager.extractElementsFromRecords(subgraphRecords);
        graphData.nodes.push(...nodes);
        graphData.links.push(...links);
    }

    console.log("Removing nodes:", removeIds);
    graphData.nodes = graphData.nodes.filter(node => !removeIds.has(node.id));
    // links will be handled by removeInvalidLinks

    return true;
}

function deduplicateNodes(graphData) {
    const seen = new Set();
    graphData.nodes = graphData.nodes.filter(n => !seen.has(n.iid) && seen.add(n.iid));
}

function deduplicateLinks(graphData) {
    const seen = new Set();
    graphData.links = graphData.links.filter(l => !seen.has(l.linkIid) && seen.add(l.linkIid));
}

export function removeInvalidLinks(graphData) {
    const nids = new Set(graphData.nodes.map(n => n.iid));
    graphData.links = graphData.links.filter(l => nids.has(l.sourceIid) && nids.has(l.targetIid));
}

export function cleanUpGraphData(graphData) {
    selfDestructLinks(graphData);
    deduplicateNodes(graphData);
    deduplicateLinks(graphData);
    removeInvalidLinks(graphData);
}
