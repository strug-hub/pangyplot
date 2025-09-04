import { updateStepDisplay } from '../ui/path-highlight-ui.js';

var animationPath = null;
var isPlaying = false;
var currentStep = -1;
var pauseInNSteps = null;
var forward = true;

function resetAnimation(startStep=-1){
    isPlaying = false;
    currentStep = startStep;
    pauseInNSteps = null;
    forward = true;
}

export function setAnimationPath(path){
    animationPath = path.path;
    updateStepDisplay(null);
    resetAnimation();
}

export function playAnimation(){
    console.log("Playing animation");
    forward = true;
    pauseInNSteps = null;
    isPlaying = true;
}

export function pauseAnimation(){
    console.log("Pausing animation");
    resetAnimation(currentStep);
}

export function frameAdvance(){
    pauseInNSteps = 1;
    forward = true;
    isPlaying = true;
}

export function frameBackward(){
    console.log("Reversing animation");
    if (currentStep < 1 ) return;
    pauseInNSteps = 1;
    forward = false;
    isPlaying = true;
}

export function isAnimationPlaying(){
    return isPlaying;
}

function splitStep(step){
    var nodeid = step.slice(0, -1);
    if (!nodeid.startsWith('s')) {
        nodeid = 's' + nodeid;
    }
    const direction = step.slice(-1);
    return [nodeid, direction];
}

export function nextStep(){
    if (!animationPath) return null;

    if (forward && currentStep >= animationPath.length-1) {
        pauseAnimation();
        return null;
    } if (!forward && currentStep <= 0) {
        pauseAnimation();
        return null;
    }

    currentStep += forward ? 1 : -1;

    console.log("Current step:", currentStep, animationPath[currentStep-1]);
    updateStepDisplay(currentStep);

    if (pauseInNSteps !== null) {
        pauseInNSteps -= 1;
        if (pauseInNSteps <= 0) {
            pauseAnimation();
        }
    }

    return splitStep(animationPath[currentStep]);
}
