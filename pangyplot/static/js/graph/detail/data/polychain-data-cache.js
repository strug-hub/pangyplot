// Polychain data cache: loaded once per chromosome from /polychain-data.
// Contains all chain decompositions + junction graph for the full chromosome.
// The frontend filters by viewport — no per-request server computation.

let _data = null;

export function initPolychainDataCache(raw) {
    if (!raw || !raw.chains || raw.chains.length === 0) {
        _data = null;
        return;
    }
    _data = raw;
}

export function hasPolychainDataCache() {
    return _data !== null;
}

/**
 * Return chain objects whose polyline x-range overlaps [minX, maxX].
 * Uses _pl_x_min/_pl_x_max stored per chain.
 */
export function getChainsInRange(minX, maxX) {
    if (!_data) return [];
    const result = [];
    for (const c of _data.chains) {
        const cMin = c._pl_x_min;
        const cMax = c._pl_x_max;
        if (cMin != null && cMax != null) {
            if (cMax >= minX && cMin <= maxX) result.push(c);
        } else {
            // No x-range info — include by default
            result.push(c);
        }
    }
    return result;
}

/**
 * Return junction segment node objects overlapping [minX, maxX].
 * Constructs node objects from packed arrays.
 */
export function getJunctionNodesInRange(minX, maxX) {
    if (!_data || !_data.junction) return [];
    const { ids, x1, y1, x2, y2, lengths, gcCounts } = _data.junction;
    const result = [];
    for (let i = 0; i < ids.length; i++) {
        if (x2[i] >= minX && x1[i] <= maxX) {
            result.push({
                id: `s${ids[i]}`,
                type: 'segment',
                x1: x1[i], y1: y1[i],
                x2: x2[i], y2: y2[i],
                length: lengths[i],
                gc_count: gcCounts[i],
                n_count: 0,
                ranges: [],
            });
        }
    }
    return result;
}

/**
 * Return GFA link pairs where BOTH endpoints are in the resolvable set.
 */
export function getJunctionLinksForNodes(resolvableIdSet) {
    if (!_data || !_data.junction || !_data.junction.links) return [];
    const result = [];
    for (const [fromId, toId] of _data.junction.links) {
        const sId = `s${fromId}`;
        const tId = `s${toId}`;
        if (resolvableIdSet.has(sId) && resolvableIdSet.has(tId)) {
            result.push({ source: sId, target: tId });
        }
    }
    return result;
}

/**
 * Return the junction links (coordinate pairs) for the full chromosome.
 * Each: { coords: [[x1,y1],[x2,y2]], segs: [seg_a, seg_b] }
 */
export function getJunctionLinkPairs() {
    if (!_data || !_data.junctionLinks) return [];
    return _data.junctionLinks.map(l => ({
        coords: [l[0], l[1]],
        segs: [l[2], l[3]],
    }));
}

export function clearPolychainDataCache() {
    _data = null;
}
