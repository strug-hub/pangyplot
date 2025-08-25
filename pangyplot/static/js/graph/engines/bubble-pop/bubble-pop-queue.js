const bubblePopUndoStack = [];

export const subgraphQueue = new Set();

export function queueSubgraph(id) {

    if (subgraphQueue.has(id)) {
        return false;
    }
    subgraphQueue.add(id);
    //TODO: showLoader();
    return true;
}

export function dequeueSubgraph(id) {
    subgraphQueue.delete(id);
    bubblePopUndoStack.push(id);

    //if (subgraphQueue.size === 0) {
       //TODO: hideLoader();
    //}
}

export function isFetchingSubgraph() {
    return subgraphQueue.size > 0;
}

export function popUndoStack(){
    if (bubblePopUndoStack.length === 0) {
        return null;
    }
    const id = bubblePopUndoStack.pop();
    return id;
}