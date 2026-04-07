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

/**
 * Render data — rebuilt on resolution.
 *
 * chainOverlays: Map<chainId, { tRanges: Array<{start, end}> }>
 * kinkHighlights: Set<SimObject>
 * bubbleHighlights: Set<SimObject>
 * waypoints: Array<{dist, pos, action, ...}>
 */
export let renderData = null;

// Animation
/** @type {Array} Waypoints for animation (from renderData.waypoints). */
export let waypoints = [];

/** @type {number} Current distance along the waypoint path (-1 = not started). */
export let cursorDist = -1;

/** @type {Set} Objects currently lit up by animation. */
export let activeHighlights = new Set();

/** @type {number} Current chain overlay progress: chainId → tCurrent. */
export let chainProgress = new Map();

export let isPlaying = false;
export let playForward = true;
export let speed = 5; // layout-space units per frame

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
    waypoints = rd?.waypoints || [];
}

export function setCursorDist(d) { cursorDist = d; }

export function setIsPlaying(p) { isPlaying = p; }

export function setPlayForward(f) { playForward = f; }

export function setSpeed(s) { speed = s; }

export function clearActiveHighlights() {
    activeHighlights = new Set();
    chainProgress = new Map();
}

export function addHighlight(obj) { activeHighlights.add(obj); }

export function setChainProgress(chainId, t) { chainProgress.set(chainId, t); }

export function clearPathTrace() {
    activeSample = null;
    subpaths = [];
    decodedPaths = new Map();
    activeSubpath = null;
    renderData = null;
    waypoints = [];
    cursorDist = -1;
    activeHighlights = new Set();
    chainProgress = new Map();
    isPlaying = false;
}
