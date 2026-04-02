// Polychain force settings — shared mutable config read by all force modules.
// UI sliders mutate this object; applyPcSettings() in force-engine.js re-applies to sim.

export const SIMPLIFY_LINK_SCALE = 1;   // rest distance = link.length * this (matches core)
export const SIMPLIFY_CHARGE = -200;

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
};

export const loopLevels = { 0: 0, 1: 1, 2: 4, 3: 10, 4: 25, 5: 50 };
export const linkStrengthLevels = { 1: 0.05, 2: 0.1, 3: 0.5, 4: 0.75, 5: 1.0 };
