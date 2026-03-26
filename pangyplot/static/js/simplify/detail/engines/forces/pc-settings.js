// Polychain force settings — shared mutable config read by all force modules.
// UI sliders mutate this object; applyPcSettings() in force-engine.js re-applies to sim.

export const SIMPLIFY_LINK_SCALE = 1;   // rest distance = link.length * this (matches core)
export const SIMPLIFY_CHARGE = -100;

export const pcSettings = {
    charge: -100,
    chargeMaxDist: 400,
    inflationLevel: 0,        // chain inflation level (0-5)
    centroidLevel: 1,         // loop push level (0-5)
    loopLevel: 0,             // loop pull level (0-5)
    collisionRadius: 5,       // node collision radius
    layoutLevel: 2,           // layout impulse level (0-5), matches core viewer
    linkStrength: 0.1,        // spring stiffness along polyline (softer = curvier)
    linkMinRest: 80,          // floor for link rest length (expands tight loops)
    linkRepulsion: 0,         // link-link perpendicular push strength
    linkRepulsionDist: 100,   // max distance for link-link repulsion
    linkRepulsionGrid: 50,    // grid cell size (~half of repulsion dist)
    smoothing: 0,             // Laplacian smoothing stiffness (0-0.03)
    inflate: 0.005,           // balloon inflation strength (0-0.02)
    parentSide: 0,            // push child chains to one side of parent
};

export const inflationLevels = { 0: 0, 1: 500, 2: 2000, 3: 5000, 4: 10000, 5: 20000 };
export const loopLevels = { 0: 0, 1: 1, 2: 4, 3: 10, 4: 25, 5: 50 };
