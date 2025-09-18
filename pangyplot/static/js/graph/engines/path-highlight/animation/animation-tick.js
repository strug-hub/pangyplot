import { tickAnimation, pauseAnimation, resetAnimation, isAnimationPlaying } from './animation-state.js';
import { updateStepDisplay } from '../path-highlight-ui.js';
import recordsManager from '../../../data/records/records-manager.js';
import forceGraph from '../../../force-graph.js';

var animationPath = null;
var currentStep = -1;
var highlightList = [];
const highlightTime = 50;

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
        highlightList.push(node);
        node.focused = 1;
        node.colorOverride = "#000000";
        //direction === "+" ? "#000000" : "#FF0000";
    }

    for (const node of forceGraph.graphData().nodes) {
        if (node.id === id) {
            node.focused = 1;
            node.colorOverride = "#000000";
            //direction === "+" ? "#000000" : "#FF0000";
        }
    }
}

export function updateNodeHighlight() {
    if (!isAnimationPlaying()) return;

    for (const node of forceGraph.graphData().nodes){
        if (node.focused){
            node.focused -= 1 / highlightTime;
        }

    }
    return;
    console.log(highlightList)
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
        activeNodeIds = new Set();
        forceGraph.graphData().nodes.forEach(element => {
            activeNodeIds.add(element.id);
        });
    }

    while (move !== 0) {
        const oneMove = move > 0 ? 1 : -1;
        currentStep += oneMove;

        if (animationPath.length <= currentStep) return;

        const [segment, bubbles] = animationPath[currentStep];
        const [id, direction] = splitSegment(segment);

        if (activeNodeIds.has(id)) {
            highlightNode(id, direction);
        } else if (bubbles.length == 0) {
            continue; // skip to next iteration
        }

        const lastHighlight = highlightList.length > 0 ?
            highlightList[highlightList.length - 1] : null;

        if (lastHighlight && bubbles.includes(lastHighlight.id)) {
            continue; // skip to next iteration
        }

        let bubbleHighlighted = false;
        for (const bid of bubbles) {
            if (activeNodeIds.has(bid)) {
                highlightNode(bid, "+");
                bubbleHighlighted = true;
                break;
            }
        }

        move -= oneMove;

        if (move === 0) {
            updateStepDisplay(currentStep);
            return;
        }
    }
}


export function pathHighlightTick(forceGraph) {
    if (!animationPath) return;

    let move = tickAnimation();

    //reset state
    if (move == null) {
        currentStep = -1;
        updateStepDisplay(null);
        return;
    }

    //paused
    if (move === 0) return;

    // end of animation
    if (currentStep + move >= animationPath.length - 1) {
        const finalMove = animationPath.length - currentStep;
        move = finalMove;
    }
    // start of animation
    if (currentStep + move <= 0) {
        const finalMove = -currentStep;
        move = finalMove
    }

    // should pause
    if (move === 0) {
        pauseAnimation();
        return;
    }

    updatePathStep(forceGraph, move);
}
