import { removeInvalidLinks, selfDestructLinks } from "./graph-data-integrity.js";

const nodeElementLookup = new Map();
const linkElementLookup = new Map();
const nodeToLinkLookup = new Map();

function addToNodeToLinkLookup(link) {
    const source = link.sourceIid;
    const target = link.targetIid;

    if (!nodeToLinkLookup.has(source)) {
        nodeToLinkLookup.set(source, new Set());
    }
    nodeToLinkLookup.get(source).add(link);

    if (!nodeToLinkLookup.has(target)) {
        nodeToLinkLookup.set(target, new Set());
    }
    nodeToLinkLookup.get(target).add(link);
}

function removeNodeToLinkLookup(link) {
    const source = link.sourceIid;
    const target = link.targetIid;

    if (nodeToLinkLookup.has(source)) {
        nodeToLinkLookup.get(source).delete(link);
    }

    if (nodeToLinkLookup.has(target)) {
        nodeToLinkLookup.get(target).delete(link);
    }
}

function reindexGraphData(forceGraph) {
    const graphData = forceGraph.graphData();

    for (const node of graphData.nodes) {
        if (!nodeElementLookup.has(node.iid)) {
            nodeElementLookup.set(node.iid, node);
        }
    }

    for (const link of graphData.links) {
        if (!linkElementLookup.has(link.linkIid)) {
            linkElementLookup.set(link.linkIid, link);
            addToNodeToLinkLookup(link);
        }
    }

    const nodeIids = new Set(graphData.nodes.map(node => node.iid));
    const linkIids = new Set(graphData.links.map(link => link.linkIid));
    for (const [iid, node] of nodeElementLookup) {
        if (!nodeIids.has(iid)) {
            nodeElementLookup.delete(iid);
        }
    }
    for (const [linkIid, link] of linkElementLookup) {
        if (!linkIids.has(linkIid)) {
            linkElementLookup.delete(linkIid);
            removeNodeToLinkLookup(link);
        }
    }
}
function addGraphData(forceGraph, newData) {

    const nodes = [...forceGraph.graphData().nodes];
    const links = [...forceGraph.graphData().links];

    nodes.push(...newData.nodes.filter(node => !nodeElementLookup.has(node.iid)));
    links.push(...newData.links.filter(link => !linkElementLookup.has(link.linkIid)));

    const graphData = { nodes, links };

    selfDestructLinks(graphData);

    removeInvalidLinks(graphData);
    
    forceGraph.graphData(graphData);
    reindexGraphData(forceGraph);
}

function replaceRecords(forceGraph, graphRecords) {

    const records = [...graphRecords.nodes, ...graphRecords.links];
    const graphData = { 
        nodes: [...records.map(r => r.elements.nodes).flat()],
        links: [...records.map(r => r.elements.links).flat()] 
    };
    
    forceGraph.graphData(graphData);
    reindexGraphData(forceGraph);
}


function removeNode(forceGraph, id) {
    const graphData = forceGraph.graphData();
    graphData.nodes = graphData.nodes.filter(node => node.id !== id);

    graphData.links = graphData.links.filter(link =>
        (link.class === "node" && link.id !== id) ||
        (link.class === "link" && link.source.id !== id && link.target.id !== id)
    );

    reindexGraphData(forceGraph);
}

export default function setUpGraphDataManager(forceGraph){

    forceGraph.addGraphData = function (graphData) {
        addGraphData(this, graphData);
    }
    forceGraph.replaceRecords = function (records) {
        replaceRecords(this, records);
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

    forceGraph.clearGraphData = function () {
        nodeElementLookup.clear();
        linkElementLookup.clear();
        nodeToLinkLookup.clear();
        forceGraph.graphData({ nodes: [], links: [] });
    }

}