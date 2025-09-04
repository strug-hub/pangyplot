export const graphElement = document.getElementById("graph");
export const forceGraph = ForceGraph()(graphElement);
export const canvasElement = document.querySelector('#graph-container canvas');

let state = {
    genome: null,
    chromosome: null,
    start: null,
    end: null,
    
    rotation: 0,

    zoomFactor: 1,
    debug: true
};

export function getGraphCoordinates() {
    const { genome, chromosome, start, end } = state;
    return { genome, chromosome, start, end };
}

export function equalCoordinates({ genome, chromosome, start, end }) {
    return state.genome === genome &&
           state.chromosome === chromosome &&
           state.start === start &&
           state.end === end;
}

export function setGraphCoordinates({ genome, chromosome, start, end }) {
    if (genome !== undefined) state.genome = genome;
    if (chromosome !== undefined) state.chromosome = chromosome;
    if (start !== undefined) state.start = start;
    if (end !== undefined) state.end = end;
}


export function resetGraphCoordinates() {
    state = { genome: null, chromosome: null, start: null, end: null };
}

export function setZoomFactor(zoomFactor) {
    state.zoomFactor = zoomFactor;
}

export function getZoomFactor() {
    return state.zoomFactor;
}

export function getRotation() {
    return state.rotation;
}

export function addRotation(rotation) {
    state.rotation += rotation;
}

export function isDebugMode() {
    return state.debug;
}

