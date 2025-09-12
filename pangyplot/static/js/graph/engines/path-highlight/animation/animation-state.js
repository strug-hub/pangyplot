var isPlaying = false;
var pauseIn = null;
var forward = true;

var frameCount = 0;
export const DEFAULT_ANIMATION_SPEED = 1;
var stepsPerFrame = DEFAULT_ANIMATION_SPEED;
var resetState = true;

export function changeAnimationSpeed(speed) {
    console.log("Changing animation speed to", speed);
    stepsPerFrame = speed;
}

export function resetAnimation(){
    isPlaying = false;
    pauseIn = null;
    forward = true;
    resetState = true;
}

export function playAnimation(){
    console.log("Playing animation");
    forward = true;
    pauseIn = null;
    isPlaying = true;
}

export function pauseAnimation(){
    console.log("Pausing animation");
    isPlaying = false;
}

export function frameAdvance(){
    pauseIn = 1;
    forward = true;
    isPlaying = true;
}

export function frameBackward(){
    console.log("Reversing animation");
    pauseIn = 1;
    forward = false;
    isPlaying = true;
}

export function isAnimationPlaying(){
    return isPlaying;
}

export function tickAnimation(){
    if (resetState && !isPlaying) return null;
    if (!isPlaying) return 0;

    resetState = false;

    frameCount++;
    let stepAdvance = 0;

    if (stepsPerFrame >=1){
        frameCount = 0;
        stepAdvance = forward ? stepsPerFrame : -stepsPerFrame;
    } else if (frameCount >= 1/stepsPerFrame) {
        frameCount = 0;
        stepAdvance = forward ? 1 : -1;
    }

    if (stepAdvance != 0 && pauseIn !== null) {
        pauseIn -= 1;
        if (pauseIn <= 0) {
            pauseAnimation();
        }
    }

    return stepAdvance;
}