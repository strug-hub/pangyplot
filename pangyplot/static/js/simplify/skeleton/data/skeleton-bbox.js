// Precompute bounding boxes for skeleton polylines and overall data bounds.

import { state } from '../../simplify-state.js';

export function precomputeBboxes() {
    state.levelBboxes = [];
    for (const level of state.data.levels) {
        const n = level.polylines.length;
        const arr = new Float64Array(n * 4);
        for (let i = 0; i < n; i++) {
            const pl = level.polylines[i];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const [x, y] of pl) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            const o = i * 4;
            arr[o] = minX; arr[o+1] = minY; arr[o+2] = maxX; arr[o+3] = maxY;
        }
        state.levelBboxes.push(arr);
    }
}

export function computeBounds() {
    const level = state.data.levels[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pl of level.polylines) {
        for (const [x, y] of pl) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    state.dataBounds = { minX, maxX, minY, maxY };
}
