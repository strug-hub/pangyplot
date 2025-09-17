import recordsManager from "../../data/records/records-manager.js"

export function calculateGCNode(startNode, steps = 2) {
    const visited = new Set();
    const queue = [{ node: startNode.record, depth: 0 }];
    let totalGC = 0;
    let totalLen = 0;

    while (queue.length > 0) {
        const { node, depth } = queue.shift();
        if (!node || visited.has(node.id) || depth > steps) continue;
        visited.add(node.id);

        // GC stats
        if (node?.gcCount != null && node?.seqLength > 0) {
            totalGC += node.gcCount;
            totalLen += node.seqLength;
        }

        // Fetch all links to this node via recordsManager
        const links = recordsManager.getLinks(node.id);
        for (const link of links) {
            // Add GC if link itself has data
            if (link?.gcCount != null && link?.seqLength > 0) {
                totalGC += link.gcCount;
                totalLen += link.seqLength;
            }
            // Enqueue the neighbor node
            const neighbor =
                link.sourceRecord?.id === node.id ? link.targetRecord : link.sourceRecord;

            if (neighbor && !visited.has(neighbor.id)) {
                queue.push({ node: neighbor, depth: depth + 1 });

            }
        }
    }

    return { gcCount: totalGC, seqLength: totalLen };
}


export function calculateGCLink(startLink, steps = 2) {
    const visited = new Set();
    const queue = [{ link: startLink.record, depth: 0 }];
    let totalGC = 0;
    let totalLen = 0;

    while (queue.length > 0) {
        const { link, depth } = queue.shift();
        if (!link || visited.has(link.id) || depth > steps) continue;
        visited.add(link.id);

        // GC stats for this link
        if (link?.gcCount != null && link?.seqLength > 0) {
            totalGC += link.gcCount;
            totalLen += link.seqLength;
        }

        // Traverse through both endpoints
        for (const node of [link.sourceRecord, link.targetRecord]) {
            if (!node) continue;

            // Get all links connected to this node
            const neighborLinks = recordsManager.getLinks(node.id);
            for (const neigh of neighborLinks) {
                if (!visited.has(neigh.id)) {
                    queue.push({ link: neigh, depth: depth + 1 });
                }
            }
        }
    }

    return { gcCount: totalGC, seqLength: totalLen };
}