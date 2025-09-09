import { deserializeBubbleSubgraph } from "../../data/deserialize/deserialize-graph.js";

export function fetchBubbleEnd(chainId) {
    const params = { id: chainId, ...forceGraph.coords };
    const url = buildUrl('/subgraph', params);
    return fetchData(url, 'subgraph');
}


export async function processBubbleContents(forceGraph, bubbleId, rawSubgraph, fetchBubbleEndFn) {
    console.log("[bubble-pop] ", rawSubgraph);

    const { bubble, source, sink } = deserializeBubbleSubgraph(rawSubgraph, bubbleId);

    //unpaired links will be removed later
    const nodes = [...bubble.nodes];
    const links = [...bubble.links, ...source.links, ...sink.links];

    console.log("[bubble-pop] deserialized ", { nodes, links });
    forceGraph.removeNodeById(bubbleId);
    forceGraph.addGraphData({ nodes, links });

    forceGraph.setSelected(nodes);

    //graphData.nodes.push(...subgraph.nodes);
    //graphData.links.push(...subgraph.links);

    //updateForceGraph(graphData);

    //eventBus.publish("graph:bubble-popped", bubbleId);
    //return subgraph;
}

