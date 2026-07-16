import { describe, it, expect } from 'vitest';
import { decodeLevel } from '@graph-data/skeleton-decoder.js';

// --- helpers to build a grid-varint level blob (mirrors the Python producer) ---

function pushUvarint(arr, u) {
    while (u >= 0x80) {
        arr.push((u & 0x7F) | 0x80);
        u >>>= 7;
    }
    arr.push(u);
}
const zigzag = (v) => (v < 0 ? -v * 2 - 1 : v * 2);

// polylines: [{ points: [[x,y],...], chainId }], all coords multiples of cell
function encodeVarintLevel(polylines, cell) {
    const bytes = [];
    for (const pl of polylines) pushUvarint(bytes, pl.points.length - 2);
    let prev = 0;
    for (const pl of polylines) {
        pushUvarint(bytes, zigzag(pl.chainId - prev));
        prev = pl.chainId;
    }
    for (const pl of polylines) {
        let [px, py] = pl.points[0];
        pushUvarint(bytes, zigzag(px / cell));
        pushUvarint(bytes, zigzag(py / cell));
        for (let j = 1; j < pl.points.length; j++) {
            const [x, y] = pl.points[j];
            pushUvarint(bytes, zigzag((x - px) / cell));
            pushUvarint(bytes, zigzag((y - py) / cell));
            px = x; py = y;
        }
    }
    return new Uint8Array(bytes);
}

function makeVarintLevel(polylines, cell) {
    return {
        numPolylines: polylines.length,
        gridSize: cell,
        _binVarint: encodeVarintLevel(polylines, cell),
        _decoded: false,
    };
}

// --- legacy int32 level (delta coords, first point absolute) ---
function makeLegacyLevel(polylines) {
    const n = polylines.length;
    const counts = new Uint32Array(n);
    const chainIds = new Int32Array(n);
    const flat = [];
    polylines.forEach((pl, i) => {
        counts[i] = pl.points.length;
        chainIds[i] = pl.chainId;
        let [px, py] = pl.points[0];
        flat.push(px, py);
        for (let j = 1; j < pl.points.length; j++) {
            const [x, y] = pl.points[j];
            flat.push(x - px, y - py);
            px = x; py = y;
        }
    });
    return {
        numPolylines: n,
        _binPointCounts: counts,
        _binChainIds: chainIds,
        _binCoords: new Int32Array(flat),
        _decoded: false,
    };
}

// Grid-varint coords are floor-snapped (cell corners); the decoder re-centers
// with +cell/2. Expected render coords are the stored corners plus cell/2.
const center = (points, cell) => points.map(([x, y]) => [x + cell / 2, y + cell / 2]);

describe('skeleton-decoder grid-varint', () => {

    it('decodes a single polyline with a chain id (re-centered)', () => {
        const level = makeVarintLevel([
            { points: [[200, 300], [300, 100], [300, 200]], chainId: 5 },
        ], 100);
        decodeLevel(level);
        expect(level.polylines).toEqual([center([[200, 300], [300, 100], [300, 200]], 100)]);
        expect(level.chainIds).toEqual([5]);
    });

    it('decodes multiple polylines and delta chain ids', () => {
        const polylines = [
            { points: [[0, 0], [100, 0]], chainId: -1 },
            { points: [[500, 500], [500, 600], [400, 600]], chainId: 12 },
            { points: [[-300, 200], [-200, 200]], chainId: 12 },
        ];
        const level = makeVarintLevel(polylines, 100);
        decodeLevel(level);
        expect(level.polylines).toEqual(polylines.map(p => center(p.points, 100)));
        expect(level.chainIds).toEqual([-1, 12, 12]);
    });

    it('handles negative coordinates and larger cells (offset scales with cell)', () => {
        const polylines = [
            { points: [[-25000, 50000], [-50000, 50000], [-50000, 25000]], chainId: 3 },
        ];
        const level = makeVarintLevel(polylines, 25000);
        decodeLevel(level);
        expect(level.polylines).toEqual([center(polylines[0].points, 25000)]);
        expect(level.chainIds).toEqual([3]);
    });

    it('is idempotent (second call is a no-op)', () => {
        const level = makeVarintLevel([
            { points: [[0, 0], [100, 100]], chainId: 1 },
        ], 100);
        decodeLevel(level);
        const first = level.polylines;
        decodeLevel(level);
        expect(level.polylines).toBe(first);
        expect(level._binVarint).toBeNull();
    });

    it('deltas are unaffected by the offset (only the anchor shifts)', () => {
        // A single +cell/2 on the anchor preserves every segment vector.
        const polylines = [
            { points: [[100, 100], [200, 100], [200, 300]], chainId: 7 },
            { points: [[1000, 1000], [900, 1000]], chainId: -1 },
        ];
        const varintLevel = makeVarintLevel(polylines, 100);
        const legacyLevel = makeLegacyLevel(polylines);
        decodeLevel(varintLevel);
        decodeLevel(legacyLevel);
        // varint output is the legacy geometry shifted by exactly +cell/2
        expect(varintLevel.polylines).toEqual(
            legacyLevel.polylines.map(pl => pl.map(([x, y]) => [x + 50, y + 50])));
        expect(varintLevel.chainIds).toEqual(legacyLevel.chainIds);
    });
});
