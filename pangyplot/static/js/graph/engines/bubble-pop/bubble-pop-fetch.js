import { queueSubgraph, dequeueSubgraph } from './bubble-pop-queue.js';
import { getGraphCoordinates } from '../../graph-state.js';
import { buildUrl, fetchData } from '../../utils/network-utils.js';
import { explodeSubgraph } from './bubble-pop-force.js';
import buildGraphData from '../../graph-data/graph-data.js';
import eventBus from '../../../input/event-bus.js';

export function fetchSubgraph(originNode, forceGraph) {
    const id = originNode.id;
    const wasAdded = queueSubgraph(id);
    if (!wasAdded) return;

    const params = {id, ...getGraphCoordinates()};

    const url = buildUrl('/subgraph', params);
    fetchData(url, 'subgraph')
        .then(fetchedData => {
            processSubgraphData(fetchedData, originNode, forceGraph);
            dequeueSubgraph(id);
        });
}

export function deleteNode(graphData, id) {
    graphData.nodes = graphData.nodes.filter(node => node.id !== id);
    graphData.links = graphData.links.filter(link =>
        (link.class === "node" && link.id !== id) ||
        (link.class === "link" && link.source.id !== id && link.target.id !== id)
    );
}

export function processSubgraphData(rawSubgraph, originNode, forceGraph) {
    let graphData = forceGraph.graphData();

    const existingIds = new Set(graphData.nodes.map(n => n.id));
        
    Object.keys(rawSubgraph["end_data"]).forEach(bubble_id =>{

        if(!existingIds.has(bubble_id)){
            const end_graph = rawSubgraph["end_data"][bubble_id]
            
            rawSubgraph["nodes"] = [ 
                ...rawSubgraph["nodes"], 
                ...end_graph["nodes"] ];
            rawSubgraph["links"] = [ 
                ...rawSubgraph["links"], 
                ...end_graph["links"] ];
            console.log(bubble_id)
            console.log(end_graph)
        }
    });

    const subgraph = buildGraphData(rawSubgraph, graphData);

    console.log("Processed subgraph data:", subgraph.links);

    explodeSubgraph(originNode, subgraph, forceGraph);

    if (originNode.isSelected) {
        subgraph.nodes.forEach(node => node.isSelected = true);
    }

    deleteNode(graphData, originNode.id);

    const existingIds2 = new Set(graphData.nodes.map(n => n.id));
    subgraph.nodes = subgraph.nodes.filter(n => !existingIds2.has(n.id));

    graphData.nodes = graphData.nodes.concat(subgraph.nodes);

    const currentNodeIds = new Set(graphData.nodes.map(node => node.nodeId));

    subgraph.links = subgraph.links.filter(link =>
        currentNodeIds.has(link.source) && currentNodeIds.has(link.target)
    );

    graphData.links = graphData.links.concat(subgraph.links);
    forceGraph.graphData(graphData);

    eventBus.publish("bubble-pop:graph-updated", true);
}