import { unpopBubble } from "../../../data/data-manager.js";

const bubblePopUndoStack = [];


export function undoBubblePop(forceGraph) {
    const bubbleId = popUndoStack();
    if (!bubbleId) return;
    unpopBubble(bubbleId);
}




function popUndoStack(){
    if (bubblePopUndoStack.length === 0) return null;
    return bubblePopUndoStack.pop();
}


function checkUndo(event, forceGraph) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoBubblePop(forceGraph);
        return;
    }
}


export default function setUpUndoPopEngine(forceGraph) {
    forceGraph.element.addEventListener('keydown', (event) => {
            checkUndo(event, forceGraph);
    });


}