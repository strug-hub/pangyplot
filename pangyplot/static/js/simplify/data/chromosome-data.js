// Shared chromosome-level data: LOD metadata, data bounds, chain metadata.
// Read by engines, render managers, and UI modules.

import { state } from '../simplify-state.js';

let levelMeta = [];    // [{gridSize, label, nodeCount, polylineCount}, ...]
let dataBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
let chainMeta = null;

// LOD
export function getLevelCount() { return levelMeta.length; }
export function getLevelMeta()  { return levelMeta[state.currentLOD]; }
export function getAllLevelMeta() { return levelMeta; }
export function setLevelMeta(meta) { levelMeta = meta; }

// Bounds
export function getDataBounds() { return dataBounds; }
export function setDataBounds(bounds) { dataBounds = bounds; }

// Chain metadata
export function getChainMeta() { return chainMeta; }
export function setChainMeta(meta) { chainMeta = meta; }
