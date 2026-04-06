// Reference spine: layout (x, y) <-> basepair coordinate translation.
// Point cloud with segment projection for robust handling of any path shape.

let spineX = null;      // Float64Array — layout x, sorted by bp
let spineY = null;      // Float64Array — layout y, sorted by bp
let spineBp = null;     // Float64Array — basepair (monotonic)

// Spatial bucket index for layoutToBp nearest-segment lookup
let gridBuckets = null; // Map<cellKey, number[]> — segment indices per cell
let gridCellW = 0;
let gridCellH = 0;
let gridMinX = 0;
let gridMinY = 0;
let gridCols = 0;
let gridRows = 0;

export function initSpine(refSpine) {
    const n = refSpine.length;
    spineX = new Float64Array(n);
    spineY = new Float64Array(n);
    spineBp = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        spineX[i] = refSpine[i][0];
        spineY[i] = refSpine[i][1];
        spineBp[i] = refSpine[i][2];
    }
    buildSpatialIndex();
}

function buildSpatialIndex() {
    const n = spineX.length;
    if (n < 2) return;

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
        if (spineX[i] < minX) minX = spineX[i];
        if (spineX[i] > maxX) maxX = spineX[i];
        if (spineY[i] < minY) minY = spineY[i];
        if (spineY[i] > maxY) maxY = spineY[i];
    }

    // Target ~100 cells per axis, minimum cell size of 1
    gridCols = Math.min(100, n);
    gridRows = Math.min(100, n);
    gridMinX = minX;
    gridMinY = minY;
    gridCellW = Math.max(1, (maxX - minX) / gridCols);
    gridCellH = Math.max(1, (maxY - minY) / gridRows);

    // Assign each segment to the grid cells its bounding box overlaps
    gridBuckets = new Map();
    for (let i = 0; i < n - 1; i++) {
        const segMinX = Math.min(spineX[i], spineX[i + 1]);
        const segMaxX = Math.max(spineX[i], spineX[i + 1]);
        const segMinY = Math.min(spineY[i], spineY[i + 1]);
        const segMaxY = Math.max(spineY[i], spineY[i + 1]);

        const c0 = Math.max(0, Math.floor((segMinX - gridMinX) / gridCellW));
        const c1 = Math.min(gridCols - 1, Math.floor((segMaxX - gridMinX) / gridCellW));
        const r0 = Math.max(0, Math.floor((segMinY - gridMinY) / gridCellH));
        const r1 = Math.min(gridRows - 1, Math.floor((segMaxY - gridMinY) / gridCellH));

        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const key = r * gridCols + c;
                let bucket = gridBuckets.get(key);
                if (!bucket) {
                    bucket = [];
                    gridBuckets.set(key, bucket);
                }
                bucket.push(i);
            }
        }
    }
}

export function isReady() { return spineX !== null && spineX.length > 0; }

/**
 * Convert basepair to layout coordinates.
 * Binary search on spineBp (monotonic), lerp both x and y.
 */
export function bpToLayout(bp) {
    if (!spineBp || spineBp.length === 0) return null;
    const n = spineBp.length;
    if (bp <= spineBp[0]) return { x: spineX[0], y: spineY[0] };
    if (bp >= spineBp[n - 1]) return { x: spineX[n - 1], y: spineY[n - 1] };

    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (spineBp[mid] <= bp) lo = mid;
        else hi = mid;
    }
    const t = (bp - spineBp[lo]) / (spineBp[hi] - spineBp[lo]);
    return {
        x: spineX[lo] + t * (spineX[hi] - spineX[lo]),
        y: spineY[lo] + t * (spineY[hi] - spineY[lo]),
    };
}

/**
 * Convert layout coordinates to basepair.
 * Finds nearest spine segment via spatial grid, projects onto it, lerps bp.
 */
export function layoutToBp(layoutX, layoutY) {
    if (!spineX || spineX.length === 0) return null;
    if (spineX.length === 1) return spineBp[0];

    // Collect candidate segments from grid cell + neighbors
    const col = Math.floor((layoutX - gridMinX) / gridCellW);
    const row = Math.floor((layoutY - gridMinY) / gridCellH);

    const candidates = new Set();
    const radius = 1;
    for (let r = row - radius; r <= row + radius; r++) {
        for (let c = col - radius; c <= col + radius; c++) {
            if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) continue;
            const bucket = gridBuckets.get(r * gridCols + c);
            if (bucket) {
                for (const idx of bucket) candidates.add(idx);
            }
        }
    }

    // If no candidates nearby, expand search (fallback for edge regions)
    if (candidates.size === 0) {
        // Brute force all segments
        for (let i = 0; i < spineX.length - 1; i++) candidates.add(i);
    }

    // Find nearest segment by perpendicular projection
    let bestDist = Infinity;
    let bestT = 0;
    let bestIdx = 0;

    for (const i of candidates) {
        const ax = spineX[i], ay = spineY[i];
        const bx = spineX[i + 1], by = spineY[i + 1];
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;

        let t;
        if (lenSq === 0) {
            t = 0;
        } else {
            t = ((layoutX - ax) * dx + (layoutY - ay) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
        }

        const projX = ax + t * dx;
        const projY = ay + t * dy;
        const dist = (layoutX - projX) * (layoutX - projX) + (layoutY - projY) * (layoutY - projY);

        if (dist < bestDist) {
            bestDist = dist;
            bestT = t;
            bestIdx = i;
        }
    }

    return spineBp[bestIdx] + bestT * (spineBp[bestIdx + 1] - spineBp[bestIdx]);
}
