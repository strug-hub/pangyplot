let state = {
    genome: null,
    chromosome: null,
    start: null,
    end: null
};

export function getGraphCoordinates() {
    return { ...state }; // return a shallow copy
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

