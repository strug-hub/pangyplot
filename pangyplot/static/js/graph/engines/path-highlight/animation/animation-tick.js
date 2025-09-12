import { tickAnimation, pauseAnimation, resetAnimation, isAnimationPlaying } from './animation-state.js';
import { updateStepDisplay } from '../path-highlight-ui.js';
import recordsManager from '../../../data/records/records-manager.js';
import forceGraph from '../../../force-graph.js';

var animationPath = null;
var currentStep = -1;
var highlightList = [];
const highlightTime = 150;

export function setAnimationPath(path) {
    animationPath = path.path;
    resetAnimation();
    currentStep = -1;
    updateStepDisplay(null);
}

function splitSegment(step) {
    var id = step.slice(0, -1);
    const direction = step.slice(-1);
    return [id, direction];
}

function highlightNode(id, direction) {
    const nodeRecord = recordsManager.getNode(id);
    const nodes = nodeRecord.elements.nodes;

    for (const node of nodes) {
        console.log("Highlighting node", node.id, direction);
        highlightList.push(node);
        node.focused = 1;
        node.colorOverride = direction === "+" ? "#000000" : "#FF0000";
    }

    for (const node of forceGraph.graphData().nodes) {
        if (node.id === id) {
            node.focused = 1;
            node.colorOverride = direction === "+" ? "#000000" : "#FF0000";
        }
    }
}

export function updateNodeHighlight() {
    if (!isAnimationPlaying()) return;
    for (let i = highlightList.length - 1; i >= 0; i--) {
        const node = highlightList[i];
        node.focused -= 1 / highlightTime;
        if (node.focused <= 0) {
            highlightList.splice(i, 1);
        }
    }
}

function updatePathStep(forceGraph, move, nodeIdSet = null) {

    let activeNodeIds;

    if (nodeIdSet) {
        activeNodeIds = nodeIdSet;
    } else {
        // todo: create a forcegraph method to create the set, update on data change only
        activeNodeIds = new Set();

        forceGraph.graphData().nodes.forEach(element => {
            activeNodeIds.add(element.id);
        });
    }

    currentStep += move;
    if (animationPath.length <= currentStep) return;

    const [segment, bubbles] = animationPath[currentStep];

    const [id, direction] = splitSegment(segment);

    if (bubbles.length == 0) {
        if (activeNodeIds.has(id)) {
            highlightNode(id, direction);
        }
        else {
            updatePathStep(forceGraph, move, activeNodeIds);
        }
    }

    const lastHighlight = highlightList.length > 0 ?
        highlightList[highlightList.length - 1] : null;

    if (lastHighlight && bubbles.includes(lastHighlight.id)) {
        updatePathStep(forceGraph, move, activeNodeIds);
        return;
    }

    for (const bid of bubbles) {
        if (activeNodeIds.has(bid)) {
            highlightNode(bid, "+");
            break;
        }
    }

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

    updatePathStep(forceGraph, move);
}
