// Initialize skeleton rendering state from raw chromosome data.
// Called by app.js after fetch; no longer fetches itself.

import { getLevels, setLevels, setChainFamily, setLevelBboxes } from './skeleton-data.js';
import { setDataBounds } from '@graph-data/chromosome-data.js';
import { decodeLevel } from '@graph-data/skeleton-decoder.js';
import { polylineBbox } from '../../utils/geometry.js';

export function initSkeleton(levels, chainMeta) {
    // Decode all levels from binary
    for (const level of levels) {
        if (!level._decoded) decodeLevel(level);
    }
    setLevels(levels);
    buildChainFamilyMap(chainMeta);
    precomputeBboxes();
    computeBounds();
}

function buildChainFamilyMap(chainMeta) {
    if (!chainMeta) return;

    const children = {};
    for (const cid in chainMeta) {
        const p = chainMeta[cid].parent;
        if (p != null) {
            (children[p] || (children[p] = [])).push(Number(cid));
        }
    }
    const family = {};
    for (const cid in chainMeta) {
        const id = Number(cid);
        const set = new Set([id]);
        const stack = [id];
        while (stack.length) {
            const cur = stack.pop();
            for (const ch of (children[cur] || [])) {
                set.add(ch);
                stack.push(ch);
            }
        }
        family[id] = set;
    }
    setChainFamily(family);
}

function precomputeBboxes() {
    const bboxes = [];
    for (const level of getLevels()) {
        const n = level.polylines.length;
        const arr = new Float64Array(n * 4);
        for (let i = 0; i < n; i++) {
            const bb = polylineBbox(level.polylines[i]);
            const o = i * 4;
            if (bb) {
                arr[o] = bb.minX; arr[o+1] = bb.minY; arr[o+2] = bb.maxX; arr[o+3] = bb.maxY;
            } else {
                arr[o] = 0; arr[o+1] = 0; arr[o+2] = 0; arr[o+3] = 0;
            }
        }
        bboxes.push(arr);
    }
    setLevelBboxes(bboxes);
}

function computeBounds() {
    const level = getLevels()[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pl of level.polylines) {
        for (const [x, y] of pl) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    setDataBounds({ minX, maxX, minY, maxY });
}
