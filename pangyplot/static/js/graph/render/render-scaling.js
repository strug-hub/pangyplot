const scaleSettings = {
    constantScale: 2,
    widthMultiplier: 2,
    textMultiplier: 1
};

export function updateWidthMultiplier(value) {
    scaleSettings.widthMultiplier = value;
}
export function updateTextMultiplier(value) {
    scaleSettings.textMultiplier = value;
}

function dampenedZoom(z, strength = 0.1) {
  // strength between 0 and 1, closer to 0 = heavier dampening
  return 1 + (z - 1) * strength;
}

const Z0=1;
const Z1=0.1;
const Z2=0.01;
const Z3=0.001;

export function getZoomLevel(ctx, continuous=false) {

    const zoomFactor = ctx.canvas.__zoom["k"];
    if (zoomFactor >= Z0) {
        return 0;
    } if (zoomFactor > Z1) {
        return continuous ?  1+(Z0 - zoomFactor) / (Z0 - Z1) : 1;
    } else if (zoomFactor > Z2) {
        return continuous ? 2+(Z1 - zoomFactor) / (Z1 - Z2) : 2;
    } else {
        return 3;
    }
}

export function getZoomFactor(ctx) {
    return ctx.canvas.__zoom["k"];
}
export function getDampenedZoomFactor(ctx) {
    return dampenedZoom(ctx.canvas.__zoom["k"]);
}



export function getScaleFactor(ctx) {
    const zoomFactor = ctx.canvas.__zoom["k"];
    const zoomLevel = getZoomLevel(ctx);
    
    let zoomLevelMultiplier;

    if (zoomLevel === 0) {
        zoomLevelMultiplier = 1;
    } else if (zoomLevel === 1) {
        zoomLevelMultiplier = 1/(2*zoomFactor);
    } else if (zoomLevel === 2) {
        zoomLevelMultiplier = 1/(2*zoomFactor);
    } else {
        zoomLevelMultiplier = 1/(2*zoomFactor);
    }

    return zoomLevelMultiplier * scaleSettings.constantScale * scaleSettings.widthMultiplier;
}

export function getTextScaleFactor(ctx) {
    const zoomFactor = ctx.canvas.__zoom["k"];
    const adjustedFactor = scaleSettings.textMultiplier;
    return 1/zoomFactor * adjustedFactor;
}


export function setUpRenderScaling(forceGraph) {
        forceGraph.minZoom(1e-6) //default = 0.01
        forceGraph.maxZoom(1) //default = 1000
}