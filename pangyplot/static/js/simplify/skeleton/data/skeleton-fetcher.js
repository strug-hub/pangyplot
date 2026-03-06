// Fetch skeleton LOD data and initialize skeleton state.

import { state } from '../../simplify-state.js';
import { precomputeBboxes, computeBounds } from './skeleton-bbox.js';
import { initGridMeter } from './lod.js';

/**
 * Fetch /skeleton-data, build chain family map, init grid meter and bboxes.
 * Throws on network/parse error.
 */
export async function fetchSkeletonData() {
    const resp = await fetch('/skeleton-data');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    state.data = await resp.json();

    migrateLegacyKeys();
    buildChainFamilyMap();
    initGridMeter();
    precomputeBboxes();
    computeBounds();
}

/** Rename legacy JSON keys (cellSize → gridSize) for older data files. */
function migrateLegacyKeys() {
    for (const level of state.data.levels) {
        if (level.cellSize != null && level.gridSize == null) {
            level.gridSize = level.cellSize;
        }
    }
}

function buildChainFamilyMap() {
    if (!state.data.chainMeta) return;

    const meta = state.data.chainMeta;
    const children = {};
    for (const cid in meta) {
        const p = meta[cid].parent;
        if (p != null) {
            (children[p] || (children[p] = [])).push(Number(cid));
        }
    }
    const family = {};
    for (const cid in meta) {
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
    state.data.chainFamily = family;
}
