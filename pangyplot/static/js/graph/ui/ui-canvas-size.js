const SCREEN_HEIGHT_PROPORTION = 0.8;
const SCREEN_WIDTH_PROPORTION = 0.8;

export function getCanvasWidth() {
    return window.innerWidth * SCREEN_WIDTH_PROPORTION;
}

export function getCanvasHeight() {
    return window.innerHeight * SCREEN_HEIGHT_PROPORTION;
}

export function canvasSize(){
    return {
        width: getCanvasWidth(),
        height: getCanvasHeight()
    };
}