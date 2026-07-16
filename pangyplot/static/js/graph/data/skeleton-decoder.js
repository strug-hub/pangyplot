// Lazy decoder for binary skeleton levels.
// Called on first access to a level's polyline data.

/**
 * Decode a single level's binary data into polylines and chainIds.
 * Dispatches on the encoding chosen by the loader: grid-varint levels carry
 * `_binVarint`, legacy int32 levels carry the `_bin*` typed-array views.
 */
export function decodeLevel(level) {
    if (level._decoded) return;
    level._decoded = true;

    if (level._binVarint) {
        decodeLevelVarint(level);
        return;
    }

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

/**
 * Decode a grid-varint level: point counts (varint, +2 bias), chain ids
 * (delta + zigzag varint), coords (per polyline the absolute anchor then
 * per-step deltas, all in grid units and scaled back by gridSize). Produces
 * the exact same polylines + chainIds as the legacy int32 path.
 */
function decodeLevelVarint(level) {
    const bytes = level._binVarint;
    const numPl = level.numPolylines;
    const cell = level.gridSize;
    let pos = 0;

    // LEB128 uvarint; values stay well within Number's safe integer range.
    function uvarint() {
        let result = 0, shift = 0, b;
        do {
            b = bytes[pos++];
            result += (b & 0x7F) * Math.pow(2, shift);
            shift += 7;
        } while (b & 0x80);
        return result;
    }
    function svarint() {
        const u = uvarint();
        return (u % 2) ? -((u + 1) / 2) : (u / 2);
    }

    const pointCounts = new Array(numPl);
    for (let i = 0; i < numPl; i++) pointCounts[i] = uvarint() + 2;

    const cids = new Array(numPl);
    let prevGid = 0;
    for (let i = 0; i < numPl; i++) {
        prevGid += svarint();
        cids[i] = prevGid;
    }

    const polylines = new Array(numPl);
    for (let i = 0; i < numPl; i++) {
        const nPts = pointCounts[i];
        const pl = new Array(nPts);
        let x = svarint() * cell;
        let y = svarint() * cell;
        pl[0] = [x, y];
        for (let j = 1; j < nPts; j++) {
            x += svarint() * cell;
            y += svarint() * cell;
            pl[j] = [x, y];
        }
        polylines[i] = pl;
    }

    level.polylines = polylines;
    level.chainIds = cids;
    level._binVarint = null;
}
