// Skeleton-specific data store — chain metadata, family tree, bounding boxes.
// Populated by skeleton-fetcher.js.
// Read by skeleton renderers/engines via getters.

import { state } from '../../simplify-state.js';

let levels = [];
let chainMeta = null;
let chainFamily = {};
let levelBboxes = [];
let dataBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };

export function getLevels() { return levels; }
export function getLevel() { return levels[state.currentLOD]; }
export function setLevels(l) { levels = l; }
export function getChainMeta() { return chainMeta; }
export function setChainMeta(meta) { chainMeta = meta; }
export function getChainFamily(chainId) { return chainFamily[chainId] || null; }
export function setChainFamily(family) { chainFamily = family; }
export function getLevelBboxes() { return levelBboxes[state.currentLOD]; }
export function setLevelBboxes(bboxes) { levelBboxes = bboxes; }
export function getDataBounds() { return dataBounds; }
export function setDataBounds(bounds) { dataBounds = bounds; }
