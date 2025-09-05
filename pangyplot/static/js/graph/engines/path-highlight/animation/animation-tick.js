import { tickAnimation, pauseAnimation, resetAnimation } from './animation-state.js';
import { isNodeActive, getNodeElements } from '../../../graph-data/graph-manager.js';
import { updateStepDisplay } from '../ui/path-highlight-ui.js';

var animationPath = null;
var currentStep = -1;
var highlightStack = [];
const highlightStackLength = 50;

export function setAnimationPath(path) {
    animationPath = path.path;
    resetAnimation();
    currentStep = -1;
    highlightStack = [];
    updateStepDisplay(null);
}

function splitSegment(step) {
    var nodeid = step.slice(0, -1);
    const direction = step.slice(-1);
    return [nodeid, direction];
}

function highlightNode(id, direction) {
    const nodes = getNodeElements(id);
    highlightStack.push({ id, direction, nodes });

    if (highlightStack.length > highlightStackLength) {

        const { id, direction, nodes } = highlightStack[0];
        for (const node of nodes) {
            node.focused = false;
            node.colorOverride = null;
        }

        highlightStack.shift();
    }
}

function updateNodeHighlight() {

    for (let i = highlightStack.length - 1; i >= 0; i--) {
        const { id, direction, nodes } = highlightStack[i];
        const alpha = i / highlightStackLength;
        for (const node of nodes) {
            node.focused = true;
            node.colorOverride =
                direction === "+" ? { color: "red", alpha } : { color: "pink", alpha };
        }
    }
}

function updatePathStep(step) {
    const [segment, bubbles] = step;

    const [nodeid, direction] = splitSegment(segment);
    console.log(bubbles)
    if (bubbles.length == 0) {
        highlightNode(nodeid, direction);
        console.log("Current step:", currentStep, "→", nodeid, direction);
    }

    const lastHighlight = highlightStack.length > 0 ?
        highlightStack[highlightStack.length - 1] : null;

    if (lastHighlight && bubbles.includes(lastHighlight.id)) {
        console.log("Current step:", currentStep, "→", nodeid, direction, "(skipping)");
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

    const tick = tickAnimation();

    //reset state
    if (tick == null) {
        currentStep = -1;
        updateStepDisplay(null);
        return;
    }

    //paused
    if (tick === 0) return;

    // end of animation
    if (tick > 0 && currentStep >= animationPath.length - 1) {
        pauseAnimation();
        return;
    }
    // start of animation
    if (tick < 0 && currentStep <= 0) {
        currentStep = 0;
        pauseAnimation();
        return;
    }

    currentStep += tick;

    updatePathStep(animationPath[currentStep]);
}
