// Per-frame render offset for canvas precision.
// At high zoom, large world coordinates lose precision in the canvas 32-bit
// transform matrix. By subtracting the viewport origin from all coordinates
// before drawing, values stay small and precision stays tight.

let _ox = 0, _oy = 0;

export function setRenderOffset(ox, oy) { _ox = ox; _oy = oy; }
export function rx(x) { return x - _ox; }
export function ry(y) { return y - _oy; }
