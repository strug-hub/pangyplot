// Polychain force settings — shared mutable config read by all force modules.
// UI sliders mutate this object; applyPcSettings() in force-engine.js re-applies to sim.

export const LINK_SCALE = 1;   // rest distance = link.length * this
export const DEFAULT_CHARGE = -200;

export const REFERENCE_LINK_DISTANCE = 20;

export const pcSettings = {
    charge: -200,
    chargeMaxDist: 400,
    centroidLevel: 1,         // loop push level (0-5)
    loopLevel: 0,             // loop pull level (0-5)
    collisionRadius: 5,       // node collision radius
    layoutLevel: 2,           // layout impulse level (0-5), matches core viewer
    linkStrengthLevel: 2,     // link strength level (1-5)
    smoothing: 0.005,         // Laplacian smoothing stiffness (0-0.03)
    inflate: 0.005,           // balloon inflation strength (0-0.02)
    parentSide: 1.5,          // push child chains to one side of parent
    guideLevel: 0.015,        // chain projection guide pull strength
    delLinkStrength: 2,       // deletion link perpendicular push
    dataScale: 1,             // auto-set from median_link_distance / REFERENCE_LINK_DISTANCE
};

/** Single read point for the scale factor — all forces use this. */
export function getScale() { return pcSettings.dataScale; }

/** Base pixel width for detail rendering (polychain lines, nodes, bubbles). */
export const BASE_RENDER_PX = 3;

// State ref — set once at init to avoid circular imports with state.
let _state = null;
export function bindRenderState(state) { _state = state; }

/** Render thickness scale: zoom-based ramp × user slider multiplier. */
export function getRenderScale() {
    const zoom = _state?.zoom ?? 1;
    const threshold = pcSettings.dataScale;
    const maxBoost = _state?.renderMaxBoost ?? 2;
    const multiplier = _state?.thicknessMultiplier ?? 1;
    const zoomBoost = zoom <= threshold ? 0 : Math.min(zoom / threshold - 1, maxBoost);
    return multiplier * (1 + zoomBoost);
}

/** Compute the base width for detail rendering at the current zoom/scale. */
export function getBaseWidth() {
    const zoom = _state?.zoom ?? 1;
    return Math.max(1.5, BASE_RENDER_PX * getRenderScale() / zoom);
}

export const loopLevels = { 0: 0, 1: 1, 2: 4, 3: 10, 4: 25, 5: 50 };
export const linkStrengthLevels = { 1: 0.05, 2: 0.1, 3: 0.5, 4: 0.75, 5: 1.0 };
