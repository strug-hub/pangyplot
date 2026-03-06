// Fetch skeleton LOD data and initialize skeleton state.

import { state } from '../../simplify-state.js';
import { getLevels, setLevels, setChainMeta, setChainFamily, setLevelBboxes, setDataBounds } from './skeleton-data.js';

/**
 * Fetch /skeleton, populate skeleton data store and app state.
 * Throws on network/parse error.
 */
export async function fetchSkeletonData(chromosome) {
    const resp = await fetch(`/skeleton?chromosome=${encodeURIComponent(chromosome)}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();

    // Skeleton-specific data → skeleton data store
    setLevels(raw.levels);
    setChainMeta(raw.chainMeta || null);
    buildChainFamilyMap(raw.chainMeta);
    precomputeBboxes();
    computeBounds();

    // App-level stats → shared state
    state.stats = raw.stats;

    // Spine init (coordinate mapping)
    if (raw.refSpine) {
        const { initSpine } = await import('../engines/reference-spine-engine.js');
        initSpine(raw.refSpine);
    }
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
