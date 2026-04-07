// Path trace state singleton for the viewer.

/** @type {string|null} */
export let activeSample = null;

/** @type {Array} Path metadata from /path-meta API. */
export let subpaths = [];

/**
 * Cached decoded paths per sample.
 * Map<sampleName, Array<{ meta: object, steps: Array<{segId, direction}> }>>
 */
export let decodedPaths = new Map();

/** @type {object|null} Currently selected subpath (user clicked in table). */
export let activeSubpath = null;

/** @type {Array<ResolvedStep>} Ordered resolved path for the active subpath. */
export let resolvedPath = [];

/**
 * Render data — rebuilt on resolution.
 *
 * chainOverlays: Map<chainId, { tRanges: Array<{start, end}> }>
 * kinkHighlights: Set<SimObject> — SegmentObjects/BubbleObjects on the path
 * bubbleHighlights: Set<SimObject> — BubbleObjects on the path (for rings)
 */
export let renderData = null;

// Animation
export let animationCursor = -1;
export let isPlaying = false;
export let playForward = true;
export let stepsPerFrame = 1;

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

export function setResolvedPath(rp) { resolvedPath = rp; }

export function setRenderData(rd) { renderData = rd; }

export function setAnimationCursor(c) { animationCursor = c; }

export function setIsPlaying(p) { isPlaying = p; }

export function setPlayForward(f) { playForward = f; }

export function setStepsPerFrame(s) { stepsPerFrame = s; }

export function clearPathTrace() {
    activeSample = null;
    subpaths = [];
    decodedPaths = new Map();
    activeSubpath = null;
    resolvedPath = [];
    renderData = null;
    animationCursor = -1;
    isPlaying = false;
}
