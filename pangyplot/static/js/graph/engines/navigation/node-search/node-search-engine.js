import { setUpNodeSearchUi, updateNodeSearchResults } from "./node-search-ui.js";
import { formatNodeLabel } from "@format-utils";

function isPresent(forceGraph, iid, isGraphId=false){
    return forceGraph.graphData().nodes.some(
        node => isGraphId ? node.iid === iid : node.id === iid);
}

function zoom(forceGraph, iid, isGraphId=false){
    forceGraph.zoomToFit(200, 100, node => 
        isGraphId ? node.iid === iid : node.id === iid);
}

function nodeSearch(forceGraph, query){

    const rawId = query;
    if (isPresent(forceGraph, rawId, true)){
        zoom(forceGraph, rawId, true);
        return [{node:formatNodeLabel(rawId)}];
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
        const id = `${nodeType}${nodeInt}`
        if (isPresent(forceGraph, id)){
            zoom(forceGraph, id);
            return [{node:formatNodeLabel(id)}];
        }
    }

    const segmentId = `s${nodeInt}`
    if (isPresent(forceGraph, segmentId)) {
        zoom(forceGraph, segmentId);
        return [{node:formatNodeLabel(segmentId)}];
    }

    const bubbleId = `b${nodeInt}`
    if (isPresent(forceGraph, bubbleId)) {
        zoom(forceGraph, bubbleId);
        return [{node:formatNodeLabel(bubbleId)}];
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
