// Reference spine: layout_x <-> basepair coordinate translation.
// Self-contained — owns its own Float64Arrays and chromosome name.

let spineX = null;      // Float64Array
let spineBp = null;     // Float64Array
let spineY = null;      // Float64Array
let spineStep = null;   // Float64Array
let chromosome = '';

export function initSpine(refSpine) {
    const n = refSpine.length;
    spineX = new Float64Array(n);
    spineBp = new Float64Array(n);
    spineY = new Float64Array(n);
    spineStep = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        spineX[i] = refSpine[i][0];
        spineBp[i] = refSpine[i][1];
        spineY[i] = refSpine[i][2];
        spineStep[i] = refSpine[i][3] ?? 0;
    }
}

export function getChromosome() { return chromosome; }
export function setChromosome(chr) { chromosome = chr; }
export function isReady() { return spineX !== null && spineX.length > 0; }

export function xToBp(layoutX) {
    if (!spineX || spineX.length === 0) return null;
    if (layoutX <= spineX[0]) return spineBp[0];
    if (layoutX >= spineX[spineX.length - 1]) return spineBp[spineBp.length - 1];
    let lo = 0, hi = spineX.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (spineX[mid] <= layoutX) lo = mid;
        else hi = mid;
    }
    const t = (layoutX - spineX[lo]) / (spineX[hi] - spineX[lo]);
    return spineBp[lo] + t * (spineBp[hi] - spineBp[lo]);
}

export function xToY(layoutX) {
    if (!spineX || spineX.length === 0) return null;
    if (layoutX <= spineX[0]) return spineY[0];
    if (layoutX >= spineX[spineX.length - 1]) return spineY[spineY.length - 1];
    let lo = 0, hi = spineX.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (spineX[mid] <= layoutX) lo = mid;
        else hi = mid;
    }
    const t = (layoutX - spineX[lo]) / (spineX[hi] - spineX[lo]);
    return spineY[lo] + t * (spineY[hi] - spineY[lo]);
}

export function bpToStep(bp) {
    if (!spineBp || spineBp.length === 0) return 0;
    if (bp <= spineBp[0]) return spineStep[0];
    if (bp >= spineBp[spineBp.length - 1]) return spineStep[spineStep.length - 1];
    let lo = 0, hi = spineBp.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (spineBp[mid] <= bp) lo = mid;
        else hi = mid;
    }
    const t = (bp - spineBp[lo]) / (spineBp[hi] - spineBp[lo]);
    return spineStep[lo] + t * (spineStep[hi] - spineStep[lo]);
}

export function bpToX(bp) {
    if (!spineBp || spineBp.length === 0) return null;
    if (bp <= spineBp[0]) return spineX[0];
    if (bp >= spineBp[spineBp.length - 1]) return spineX[spineX.length - 1];
    let lo = 0, hi = spineBp.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (spineBp[mid] <= bp) lo = mid;
        else hi = mid;
    }
    const t = (bp - spineBp[lo]) / (spineBp[hi] - spineBp[lo]);
    return spineX[lo] + t * (spineX[hi] - spineX[lo]);
}
