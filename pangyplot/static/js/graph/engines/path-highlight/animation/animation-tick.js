import { tickAnimation, pauseAnimation, resetAnimation } from './animation-state.js';
import { getNodeElements } from '../../../graph-data/graph-manager.js';
import { updateStepDisplay } from '../ui/path-highlight-ui.js';

const animatedNodes = [];
var animationBubblePath = null;
var animationPath = null;
var currentStep = -1;
var stepStructure = [];

export function setAnimationPath(path){
    animationPath = path.bubble_path;
    animationBubblePath = path.bubble_path;
    resetAnimation();
    currentStep = -1;
    stepStructure = [0];
    updateStepDisplay(null);
}

function updatePathStep(tick) {

    //get next step
    currentStep += tick;

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


        console.log("Current step:", currentStep, animationPath[currentStep-1]);
    


    return null;//splitStep(animationPath[currentStep]);
}

export function pathHighlightTick(forceGraph) {
   if (!animationPath) return;

    const tick = tickAnimation();

    //reset state
    if (tick == null){ 
        currentStep = -1;
        stepStructure = [0];
        updateStepDisplay(null);
        return;
    }

    //paused
    if (tick === 0) return; 

    // end of animation
    if (tick > 0 && currentStep >= animationPath.length-1) {
        pauseAnimation();
        return;
    } 
    // start of animation
    if (tick < 0 && currentStep <= 0) {
        currentStep = 0;
        stepStructure = [0];
        pauseAnimation();
        return;
    }

    currentStep += tick;

    updatePathStep(tick);
}

function splitStep(step){
    var nodeid = step.slice(0, -1);
    if (!nodeid.startsWith('s')) {
        nodeid = 's' + nodeid;
    }
    const direction = step.slice(-1);
    return [nodeid, direction];
}

