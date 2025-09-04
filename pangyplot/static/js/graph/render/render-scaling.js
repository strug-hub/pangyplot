const scaleSettings = {
    constantScale: 2,
    widthMultiplier: 1,
    textSizeMultiplier: 1
};

export function updateWidthMultiplier(value) {
    scaleSettings.widthMultiplier = value;
}
export function updateTextSizeMultiplier(value) {
    scaleSettings.textSizeMultiplier = value;
}

function dampenedZoom(z, strength = 0.1) {
  // strength between 0 and 1, closer to 0 = heavier dampening
  return 1 + (z - 1) * strength;
}

export function getZoomFactor(ctx) {
    return ctx.canvas.__zoom["k"];
}
export function getDampenedZoomFactor(ctx) {
    return dampenedZoom(ctx.canvas.__zoom["k"]);
}

const MAX_THICKEN=100;
function getThickenFactor(ctx) {
    const zoomLevel = ctx.canvas.__zoom["k"];
    if (zoomLevel > 1) return 1;

    return Math.min(1 / zoomLevel, MAX_THICKEN);
}

export function getScaleFactor(ctx) {
    const zoomFactor = dampenedZoom(ctx.canvas.__zoom["k"]);
    const constantFactor = scaleSettings.constantScale;
    const adjustedFactor = scaleSettings.widthMultiplier;
    const thickenFactor = getThickenFactor(ctx);
    return zoomFactor * constantFactor * adjustedFactor * thickenFactor;
}

export function getTextScaleFactor(ctx) {
    const zoomFactor = ctx.canvas.__zoom["k"];
    const adjustedFactor = scaleSettings.textSizeMultiplier;

    return 1/zoomFactor * adjustedFactor;
}