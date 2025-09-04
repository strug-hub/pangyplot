var currentPath = null;
export var isPlaying = false;
export var currentStep = 0;


export function loadInPaths(paths){
    //get longest paths:
    console.log("Longest paths:", paths[0]["length"]);

    paths.sort((a, b) => b["length"] - a["length"]);
    const longestPath = paths[0];

    currentPath = longestPath.path;
}


export function playAnimation(){
    console.log("Playing animation");
    isPlaying = true;
}

export function endAnimation(){
    console.log("Ending animation");
    isPlaying = false;
    currentStep = 0;
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
    if (!currentPath || currentStep >= currentPath.length) {
        endAnimation();
        return null;
    }
    currentStep += 1;

    return splitStep(currentPath[currentStep-1]);
}
