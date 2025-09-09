import { recordsManager } from "../records/records-manager.js";

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

export function selfDestructLinks(graphData) {
    const nids = new Set(
        graphData.nodes.map(node => node.iid)
    );

    const selfDestruct = graphData.links.filter(link => 
        link.record.isSelfDestructLink && nids.has(link.sourceIid) && nids.has(link.targetIid));
    
    if (selfDestruct.length === 0) return;

    const removeIds = [...selfDestruct.map(link => link.sourceId), ...selfDestruct.map(link => link.targetId)];
    console.log("Removing nodes:", removeIds);
    graphData.nodes = graphData.nodes.filter(node => !removeIds.includes(node.id));

    for (const id of removeIds) {
        const { nodes, links } = recordsManager.getChildSubgraph(id);
        graphData.nodes.push(...nodes);
        graphData.links.push(...links);
    }

    // links will be handled by removeInvalidLinks

    return true;
}

export function removeInvalidLinks(graphData) {
    const nids = new Set(
        graphData.nodes.map(node => node.iid)
    );

    graphData.links = graphData.links.filter(l => 
        nids.has(l.sourceIid) && nids.has(l.targetIid)
    );
}

export function cleanGraph(graphData) {
    deduplicateNodes(graphData);
    deduplicateLinks(graphData);
    removeInvalidLinks(graphData);
}
