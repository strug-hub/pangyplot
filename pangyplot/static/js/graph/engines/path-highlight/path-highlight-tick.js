import { isPlaying, nextStep } from './path-highlight-state.js';

const framesPerStep = 1;
var frameCount = 0;

function addPathStep(forceGraph, nodeid, direction) {
    console.log("Adding path step:", nodeid, direction);

    forceGraph.graphData().nodes.forEach(node => {
        if (node.id === nodeid) {
            console.log("Highlighting node:", nodeid, direction);
            if(direction === "+") {
                node.color_override = "red";
            }else{
                node.color_override = "pink";
            }
        }
    });
}


export function pathHighlightTick(forceGraph) {
    if (!isPlaying) return

    frameCount++;
    if (frameCount >= framesPerStep) {
        frameCount = 0;
        addPathStep(forceGraph, ...nextStep());

    }


}