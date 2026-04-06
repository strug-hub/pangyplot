// Node/bubble/chain search for the viewer.
// Parses query prefix (s/b/c) to determine element type,
// finds position in current view, stores highlight state for ring rendering.
// When a bubble or chain has been popped, highlights all child parts instead.

import { state } from '../state.js';
import { getLevel } from '../skeleton/data/skeleton-data.js';
import { getForceNodes } from '../detail/data/force-data.js';
import { getAllContainers } from '../detail/model/model-manager.js';
import popTree from '../detail/data/pop-tree.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';
import { formatNodeLabel } from '@format-utils';

// ---------------------------------------------------------------
// Search highlight state (read by render-manager each frame)
// ---------------------------------------------------------------

// Array of { ref, type } where ref is a live object (force node,
// bubble position, or polyline array).
let searchRefs = [];

/**
 * Resolve live coordinates each frame from stored references.
 * Returns array of { x, y, radius } (empty if nothing to highlight).
 */
export function getSearchHighlights() {
    const results = [];
    for (const sr of searchRefs) {
        if (sr.type === 'segment' || sr.type === 'bubble') {
            const obj = sr.ref;
            if (obj.x == null || obj.x === -99999) continue;
            results.push({ x: obj.x, y: obj.y, radius: 0 });
        } else if (sr.type === 'chain') {
            const bounds = polylineBounds(sr.ref);
            if (bounds) results.push(bounds);
        }
    }
    return results;
}

export function clearSearchHighlight() {
    searchRefs = [];
    scheduleFrame();
}

// ---------------------------------------------------------------
// Element finders — return live object references, not snapshots
// ---------------------------------------------------------------

function findSegment(numId) {
    const nodes = getForceNodes();
    const target = 's' + numId;
    const node = nodes.find(n => n.id === target && !n.isPolychainNode);
    if (!node || node.x == null) return null;
    return [{ ref: node, type: 'segment' }];
}

function findBubble(numId) {
    const bubbleId = 'b' + numId;

    // If this bubble has been popped, highlight its children instead
    if (popTree.has(bubbleId)) {
        return findPoppedChildren(bubbleId);
    }

    // Check force nodes (bubble may be a force node from a popped chain)
    const nodes = getForceNodes();
    const forceNode = nodes.find(n => n.id === bubbleId && !n.isPolychainNode);
    if (forceNode && forceNode.x != null) {
        return [{ ref: forceNode, type: 'bubble' }];
    }

    // Check bubble circles on chains
    const chains = state.detailData?.chains;
    if (!chains) return null;

    for (const [, container] of getAllContainers()) {
        for (const seg of container.segments) {
            const circles = seg._lastBubbleCircles;
            if (!circles) continue;
            for (const b of circles) {
                if (b.id === bubbleId || b.meta?.id === bubbleId) {
                    return [{ ref: { x: b.x, y: b.y, meta: b.meta }, type: 'bubble' }];
                }
            }
        }
    }
    return null;
}

function findChain(numId) {
    const target = 'c' + numId;

    // Check if this chain has been split by pops (subchains like c42:0, c42:1)
    if (state.detailData?.chains) {
        const subchains = state.detailData.chains.filter(c =>
            c.id === target || c.id.startsWith(target + ':')
        );
        if (subchains.length > 0) {
            const refs = [];
            for (const sc of subchains) {
                if (sc.polyline?.length > 0) {
                    refs.push({ ref: sc.polyline, type: 'chain' });
                }
            }
            if (refs.length > 0) return refs;
        }
    }

    // Fall back to skeleton polylines (static positions)
    const level = getLevel();
    if (!level) return null;
    const targetId = parseInt(numId, 10);
    for (let i = 0; i < level.chainIds.length; i++) {
        if (level.chainIds[i] === targetId) {
            const pl = level.polylines[i];
            if (pl?.length > 0) {
                return [{ ref: pl, type: 'chain' }];
            }
        }
    }
    return null;
}

/**
 * When a bubble has been popped, find all its child force nodes.
 * Recursively descends into nested pops.
 */
function findPoppedChildren(bubbleId) {
    const popNode = popTree.pops.get(bubbleId);
    if (!popNode) return null;

    const refs = [];
    const childIids = popNode.popEntry?.childIids || [];
    const nodes = getForceNodes();

    // Find force nodes matching the child iids
    for (const iid of childIids) {
        const node = nodes.find(n => n.iid === iid && !n.isPolychainNode);
        if (node && node.x != null) {
            refs.push({ ref: node, type: 'segment' });
        }
    }

    // Recurse into nested pops
    for (const childBubbleId of popNode.children) {
        const childRefs = findPoppedChildren(childBubbleId);
        if (childRefs) refs.push(...childRefs);
    }

    return refs.length > 0 ? refs : null;
}

function polylineBounds(pl) {
    if (!pl || pl.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of pl) {
        const x = pt[0], y = pt[1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const dx = maxX - minX;
    const dy = maxY - minY;
    const radius = Math.max(Math.hypot(dx, dy) / 2, 5);
    return { x: cx, y: cy, radius };
}

// ---------------------------------------------------------------
// Pan viewport to center on highlights
// ---------------------------------------------------------------

function panToCenter(highlights) {
    if (highlights.length === 0) return;
    let cx = 0, cy = 0;
    for (const h of highlights) { cx += h.x; cy += h.y; }
    cx /= highlights.length;
    cy /= highlights.length;

    const dpr = window.devicePixelRatio || 1;
    const cw = state.canvas.width / dpr;
    const ch = state.canvas.height / dpr;
    state.panX = (cw / 2) - (cx * state.zoom);
    state.panY = (ch / 2) - (cy * state.zoom);
}

// ---------------------------------------------------------------
// Search dispatch
// ---------------------------------------------------------------

function executeSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
        searchRefs = [];
        updateResults(null, true);
        scheduleFrame();
        return;
    }

    let hits = null;
    let type = 'segment';
    let numId = q;

    if (q.startsWith('b')) {
        type = 'bubble';
        numId = q.slice(1);
    } else if (q.startsWith('c')) {
        type = 'chain';
        numId = q.slice(1);
    } else if (q.startsWith('s')) {
        type = 'segment';
        numId = q.slice(1);
    }

    switch (type) {
        case 'segment': hits = findSegment(numId); break;
        case 'bubble':  hits = findBubble(numId);  break;
        case 'chain':   hits = findChain(numId);   break;
    }

    if (hits && hits.length > 0) {
        searchRefs = hits;
        const resolved = getSearchHighlights();
        panToCenter(resolved);
        const label = type === 'segment' ? `s${numId}` : type === 'bubble' ? `b${numId}` : `c${numId}`;
        updateResults([{ node: formatNodeLabel(label) }], false);
    } else {
        searchRefs = [];
        updateResults(null, false);
    }
    scheduleFrame();
}

// ---------------------------------------------------------------
// Results display (mirrors node-search-ui.js)
// ---------------------------------------------------------------

function updateResults(queryResult, cleared) {
    const container = document.getElementById('node-search-results');
    if (!container) return;
    container.innerHTML = '';

    if (cleared) return;

    if (queryResult == null) {
        const div = document.createElement('div');
        div.textContent = 'No results found in current view';
        div.classList.add('no-data');
        container.appendChild(div);
        return;
    }

    for (const result of queryResult) {
        const div = document.createElement('div');
        div.innerHTML = result.node;
        container.appendChild(div);
    }
}

// ---------------------------------------------------------------
// Wire up DOM
// ---------------------------------------------------------------

export function setupNodeSearch() {
    const searchBar = document.getElementById('node-search-bar');
    const searchButton = document.getElementById('node-search-button');
    if (!searchBar || !searchButton) return;

    searchBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') executeSearch(searchBar.value);
    });

    searchButton.addEventListener('click', () => {
        executeSearch(searchBar.value);
    });
}
