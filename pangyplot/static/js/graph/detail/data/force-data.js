// Canonical force node/link arrays. Owned here, written by force-engine,
// read by renderers and hit-test modules.

let nodes = [];
let links = [];

export function getForceNodes() { return nodes; }
export function getForceLinks() { return links; }
export function setForceNodes(n) { nodes = n; }
export function setForceLinks(l) { links = l; }

// Debug access
window.__forceNodes = () => nodes;
window.__forceLinks = () => links;
