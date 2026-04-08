// Lazy decoder for binary skeleton levels.
// Called on first access to a level's polyline data.

/**
 * Decode a single level's binary data into polylines and chainIds.
 */
export function decodeLevel(level) {
    if (level._decoded) return;
    level._decoded = true;

    const numPl = level.numPolylines;
    const coords = level._binCoords;

    // Delta-decode coordinates in-place
    for (let i = 0, c = 0; i < numPl; i++) {
        const nPts = level._binPointCounts[i];
        c += 2; // first point is absolute
        for (let j = 1; j < nPts; j++) {
            coords[c] += coords[c - 2];
            coords[c + 1] += coords[c - 1];
            c += 2;
        }
    }

    // Reconstruct polylines as arrays of [x, y] pairs
    const polylines = new Array(numPl);
    let ci = 0;
    for (let i = 0; i < numPl; i++) {
        const nPts = level._binPointCounts[i];
        const pl = new Array(nPts);
        for (let j = 0; j < nPts; j++) {
            pl[j] = [coords[ci], coords[ci + 1]];
            ci += 2;
        }
        polylines[i] = pl;
    }

    // Reconstruct chainIds as plain array
    const cids = new Array(numPl);
    for (let i = 0; i < numPl; i++) cids[i] = level._binChainIds[i];

    level.polylines = polylines;
    level.chainIds = cids;

    // Free binary refs
    level._binPointCounts = null;
    level._binChainIds = null;
    level._binCoords = null;
}
