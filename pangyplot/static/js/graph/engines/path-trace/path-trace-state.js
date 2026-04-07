// Path trace state singleton for the viewer.

/** @type {string|null} */
export let activeSample = null;

/** @type {Array} Path metadata from /path-meta API. */
export let subpaths = [];

/**
 * Cached decoded paths per sample.
 * Map<sampleName, Array<steps>>
 */
export let decodedPaths = new Map();

/** @type {object|null} Currently selected subpath (user clicked in table). */
export let activeSubpath = null;

/**
 * Render data — rebuilt on resolution.
 *
 * chainOverlays: Map<chainId, { tRanges: Array<{start, end}> }>
 * kinkHighlights: Set<SimObject>
 * bubbleHighlights: Set<SimObject>
 * frames: Array<{type, ...}> — animation frame sequence
 */
export let renderData = null;

// Animation
/** @type {Array} Animation frames from renderData.frames. */
export let frames = [];

/** @type {number} Current frame index (-1 = not started). */
export let currentFrame = -1;

/** @type {number} Number of trailing frames to show in the tail. */
export const TAIL_LENGTH = 8;

export let isPlaying = false;
export let playForward = true;
export let speed = 1; // multiplier: 1x = one frame per 500ms

// ---------------------------------------------------------------
// Mutators
// ---------------------------------------------------------------

export function setActiveSample(sample) { activeSample = sample; }

export function setSubpaths(paths) { subpaths = paths; }

export function setDecodedPaths(sample, paths) { decodedPaths.set(sample, paths); }

export function getDecodedPath(sample, index) {
    const paths = decodedPaths.get(sample);
    return paths ? paths[index] : null;
}

export function setActiveSubpath(sp) { activeSubpath = sp; }

export function setRenderData(rd) {
    renderData = rd;
    frames = rd?.frames || [];
}

export function setCurrentFrame(f) { currentFrame = f; }

export function setIsPlaying(p) { isPlaying = p; }

export function setPlayForward(f) { playForward = f; }

export function setSpeed(s) { speed = s; }

export function clearPathTrace() {
    activeSample = null;
    subpaths = [];
    decodedPaths = new Map();
    activeSubpath = null;
    renderData = null;
    frames = [];
    currentFrame = -1;
    isPlaying = false;
}
