import { cleanUpGraphData } from "./graph-data-integrity.js";

function addGraphData(forceGraph, newData) {

    const graphData = forceGraph.graphData();

    graphData.nodes.push(...newData.nodes);
    graphData.links.push(...newData.links);

    forceGraph.graphData({
        nodes: [...graphData.nodes, ...newData.nodes],
        links: [...graphData.links, ...newData.links]
    });

    cleanUpGraphData(graphData);
    forceGraph.graphData(graphData);
}

function removeNode(forceGraph, id) {
    const graphData = forceGraph.graphData();
    graphData.nodes = graphData.nodes.filter(node => node.id !== id);

    graphData.links = graphData.links.filter(link =>
        (link.class === "node" && link.id !== id) ||
        (link.class === "link" && link.source.id !== id && link.target.id !== id)
    );
}

export default function setUpGraphDataManager(forceGraph) {


    forceGraph.addGraphData = function (graphData) {
        addGraphData(this, graphData);
    }

    forceGraph.removeNodeById = function (id) {
        removeNode(this, id);
    }

    forceGraph.getNode = function (iid) {
        return nodeElementLookup.get(iid) || null;
    }
    forceGraph.getLink = function (linkIid) {
        return linkElementLookup.get(linkIid) || null;
    }


}