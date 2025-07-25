export const subgraphQueue = new Set();

export function queueSubgraph(node) {
    if (subgraphQueue.has(node.id)) {
        return false;
    }
    subgraphQueue.add(node.id);
    //TODO: showLoader();
    console.log(subgraphQueue);

    return true;

}

export function dequeueSubgraph(id) {
    subgraphQueue.delete(id);
    //if (subgraphQueue.size === 0) {
       //TODO: hideLoader();
    //}
}

export function isFetchingSubgraph() {
    return subgraphQueue.size > 0;
}