import { unpopBubble } from "../../../data/data-manager.js";
import eventBus from '../../../../utils/event-bus.js';

const bubblePopUndoStack = [];


export function undoBubblePop(forceGraph) {
    const bubbleId = popUndoStack();
    if (!bubbleId) return;
    unpopBubble(bubbleId, forceGraph);
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
    eventBus.subscribe('graph:bubble-popped', (data) => {
        bubblePopUndoStack.push(data.id);
    });

    eventBus.subscribe('graph:data-replaced', () => {
        bubblePopUndoStack.length = 0;
    });

    forceGraph.element.addEventListener('keydown', (event) => {
        //checkUndo(event, forceGraph);
    });
}