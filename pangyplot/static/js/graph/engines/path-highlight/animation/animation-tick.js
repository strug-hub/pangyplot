import { tickAnimation, pauseAnimation, resetAnimation } from './animation-state.js';
import { isNodeActive, getNodeElements } from '../../../data/graph-data-manager.js';
import { updateStepDisplay } from '../path-highlight-ui.js';

var animationPath = null;
var currentStep = -1;
var highlightStack = [];
const maxHighlightStackLength = 150;

export function setAnimationPath(path) {
    resetHighlightStack();
    animationPath = path.path;
    resetAnimation();
    currentStep = -1;
    highlightStack = [];
    updateStepDisplay(null);

    let count = 0;
    for (const step of animationPath) {
        const [segment, bubbles] = step;
        const [id, direction] = splitSegment(segment);

        if (isNodeActive(id)) {
            count++;
        }
    }
    console.log("Animation path set with", animationPath.length, "steps,", count, "active nodes ", count / animationPath.length * 100, "%");
}

function resetHighlightStack() {
    for (const highlight of highlightStack) {
        for (const node of highlight.nodes) {
            node.focused = 0;
            node.colorOverride = null;
        }
    }
    highlightStack = [];
}


function splitSegment(step) {
    var id = step.slice(0, -1);
    const direction = step.slice(-1);
    return [id, direction];
}

function highlightNode(id, direction) {
    const nodes = getNodeElements(id);
    highlightStack.push({ id, direction, nodes });

    if (highlightStack.length > maxHighlightStackLength) {

        const { id, direction, nodes } = highlightStack[0];
        for (const node of nodes) {
            node.focused = 0;
            node.colorOverride = null;
        }

        highlightStack.shift();
    }
}

function updateNodeHighlight() {

    for (let i = highlightStack.length - 1; i >= 0; i--) {
        const { id, direction, nodes } = highlightStack[i];
        const alpha = i / highlightStack.length;
        for (const node of nodes) {
            node.focused = alpha;
            node.colorOverride = direction === "+" ? "#000000" : "#FF0000";
        }
    }
}


function updatePathStep(move) {
    currentStep += move;
    const [segment, bubbles] = animationPath[currentStep];

    const [id, direction] = splitSegment(segment);
    console.log(bubbles)
    if (bubbles.length == 0) {
        highlightNode(id, direction);
        console.log("Current step:", currentStep, "→", id, direction);
    }

    const lastHighlight = highlightStack.length > 0 ?
        highlightStack[highlightStack.length - 1] : null;

    if (lastHighlight && bubbles.includes(lastHighlight.id)) {
        console.log("Current step:", currentStep, "→", id, direction, "(skipping)");
        return;
    }

    for (const bid of bubbles) {
        if (isNodeActive(bid)) {
            highlightNode(bid, "+");
            console.log("Current step:", currentStep, "→", bid, "+", "(skipping)");
            break;
        }
    }

    updateNodeHighlight();

    updateStepDisplay(currentStep);

}


export function pathHighlightTick(forceGraph) {
    if (!animationPath) return;

    const move = tickAnimation();

    //reset state
    if (move == null) {
        currentStep = -1;
        updateStepDisplay(null);
        return;
    }

    //paused
    if (move === 0) return;

    // end of animation
    if (move > 0 && currentStep >= animationPath.length - 1) {
        pauseAnimation();
        return;
    }
    // start of animation
    if (move < 0 && currentStep <= 0) {
        currentStep = 0;
        pauseAnimation();
        return;
    }
    
    updatePathStep(move);
}
