// Skeleton-internal data store — LOD levels, family tree, bounding boxes.
// Populated by skeleton-init.js.
// Read by skeleton renderers/engines via getters.

import { state } from '../../state.js';

let levels = [];
let chainFamily = {};
let levelBboxes = [];

export function getLevels() { return levels; }
export function getLevel() { return levels[state.currentLOD]; }
export function setLevels(l) { levels = l; }
export function getChainFamily(chainId) { return chainFamily[chainId] || null; }
export function setChainFamily(family) { chainFamily = family; }
export function getLevelBboxes() { return levelBboxes[state.currentLOD]; }
export function setLevelBboxes(bboxes) { levelBboxes = bboxes; }
