import { cleanUpGraphData } from "./graph-data-integrity.js";
import { checkForObjectMismatch, auditRecordElementCircular } from "../../../debug/check-for-object-mismatch.js";

function addGraphData(forceGraph, newData) {

    for (const n of newData.nodes) {
    const existing = forceGraph.graphData().nodes.find(x => x.iid === n.iid);
    if (existing && existing !== n) {
        console.warn("Different object for same iid BEFORE push", n.iid, existing, n);
    }
    }

    const graphData = forceGraph.graphData();
    checkForObjectMismatch(newData);

    graphData.nodes.push(...newData.nodes);
    graphData.links.push(...newData.links);

    checkForObjectMismatch(graphData);

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

function replaceGraphData(forceGraph, graphData) {
    cleanUpGraphData(graphData)   
    forceGraph.graphData(graphData);
}

export default function setUpGraphDataManager(forceGraph) {

    forceGraph.replaceGraphData = function (graphData) {
        replaceGraphData(this, graphData);
    }

    forceGraph.addGraphData = function (graphData) {
        addGraphData(this, graphData);
    }

    forceGraph.removeNodeById = function (id) {
        removeNode(this, id);
    }

    forceGraph.getNode = function (iid) {
        return nodeElementLookup.get(iid) || null;
    }
    forceGraph.getLink = function (iid) {
        return linkElementLookup.get(iid) || null;
    }


}