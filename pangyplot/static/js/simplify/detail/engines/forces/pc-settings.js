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
    linkStrength: 0.1,        // spring stiffness along polyline (softer = curvier)
    linkMinRest: 80,          // floor for link rest length (expands tight loops)
    smoothing: 0.005,         // Laplacian smoothing stiffness (0-0.03)
    inflate: 0.005,           // balloon inflation strength (0-0.02)
    parentSide: 1.5,          // push child chains to one side of parent
};

export const loopLevels = { 0: 0, 1: 1, 2: 4, 3: 10, 4: 25, 5: 50 };
