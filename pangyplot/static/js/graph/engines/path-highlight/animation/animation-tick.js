import { isAnimationPlaying, nextStep } from './animation-state.js';
import { getNodeElements } from '../../../graph-data/graph-manager.js';

const animatedNodes = [];
var framesPerStep = 5;
var frameCount = 0;

function addPathStep(forceGraph, nodeid, direction) {
    console.log("Adding path step:", nodeid, direction);

    animatedNodes.push(nodeid);
    console.log("Animated nodes:", nodeid, getNodeElements(nodeid));
    getNodeElements(nodeid).forEach( node => {
    console.log("Highlighting node:", node, direction);
    if (direction === "+") {
        node.color_override = "red";
        }else{
            node.color_override = "pink";
        }
    });

}

export function changeAnimationSpeed(speed) {
    framesPerStep = 11-speed;
}

export function pathHighlightTick(forceGraph) {
    if (!isAnimationPlaying()) return

    frameCount++;
    if (frameCount >= framesPerStep) {
        frameCount = 0;
        const step = nextStep();
        if (step) {
            addPathStep(forceGraph, ...step);
        }
    }


}