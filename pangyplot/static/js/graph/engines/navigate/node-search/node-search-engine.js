import { setUpNodeSearchUi, updateNodeSearchResults } from "./node-search-ui.js";
import { faLabel } from "../../selection/selection-utils.js";

function isPresent(forceGraph, id, isGraphId=false){
    return forceGraph.graphData().nodes.some(
        node => isGraphId ? node.nodeId === id : node.id === id);
}

function zoom(forceGraph, id, isGraphId=false){
    forceGraph.zoomToFit(200, 100, node => 
        isGraphId ? node.nodeId === id : node.id === id);
}

//todo add support for list
function nodeSearch(forceGraph, query){

    const rawId = query;
    if (isPresent(forceGraph, rawId, true)){
        zoom(forceGraph, rawId, true);
        return [{node:faLabel(rawId)}];
    }
    
    let nodeInt;
    let nodeType = null;
    
    try {
        nodeInt = parseInt(query);
    } catch (error) {

        if(!query.startsWith("s") && !query.startsWith("b")) return null;
        
        try {
            nodeType = query.charAt(0);
            nodeInt = parseInt(query.slice(1));
        } catch (error) {
            return null;
        }
    }



    if (nodeType != null){
        const nodeId = `${nodeType}${nodeInt}`
        if (isPresent(forceGraph, nodeId)){
            zoom(forceGraph, nodeId);
            return [{node:faLabel(nodeId)}];
        }
    }

    const segmentId = `s${nodeInt}`
    if (isPresent(forceGraph, segmentId)) {
        zoom(forceGraph, segmentId);
        return [{node:faLabel(segmentId)}];
    }

    const bubbleId = `b${nodeInt}`
    if (isPresent(forceGraph, bubbleId)) {
        zoom(forceGraph, bubbleId);
        return [{node:faLabel(bubbleId)}];
    }

    return null;
}

export default function setUpNodeSearchEngine(forceGraph){
    const {searchBar, searchButton} = setUpNodeSearchUi();

    searchBar.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            const query = searchBar.value;
            const results = nodeSearch(forceGraph, query);
            updateNodeSearchResults(results);
        }
    });

    searchButton.addEventListener("click", () => {
        const query = searchBar.value;
        const results = nodeSearch(forceGraph, query);
        updateNodeSearchResults(results);
    });

}
