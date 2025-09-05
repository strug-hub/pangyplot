var isPlaying = false;
var pauseInNSteps = null;
var forward = true;

var frameCount = 0;
var framesPerStep = 5;
var resetState = true;

export function changeAnimationSpeed(speed) {
    framesPerStep = 11-speed;
}

export function resetAnimation(){
    isPlaying = false;
    pauseInNSteps = null;
    forward = true;
    resetState = true;
}

export function playAnimation(){
    console.log("Playing animation");
    forward = true;
    pauseInNSteps = null;
    isPlaying = true;
}

export function pauseAnimation(){
    console.log("Pausing animation");
    isPlaying = false;
}

export function frameAdvance(){
    pauseInNSteps = 1;
    forward = true;
    isPlaying = true;
}

export function frameBackward(){
    console.log("Reversing animation");
    pauseInNSteps = 1;
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
    if (frameCount >= framesPerStep) {
        frameCount = 0;
    
        if (pauseInNSteps !== null) {
            pauseInNSteps -= 1;
            if (pauseInNSteps <= 0) {
                pauseAnimation();
            }
        }

        return forward ? 1 : -1;
    }

    return 0;
}