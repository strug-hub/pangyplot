// Path trace state singleton for the viewer.

/** @type {string|null} */
export let activeSample = null;

/** @type {Array} Raw subpaths from /path API. */
export let subpaths = [];

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
    activeSubpath = null;
    resolvedPath = [];
    renderData = null;
    animationCursor = -1;
    isPlaying = false;
}
