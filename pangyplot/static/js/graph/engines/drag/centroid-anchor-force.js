// Soft-spring anchor force: pins each node in a chain to its drop position
// with a tunable spring strength. Constrains translation, rotation, and
// stretch — unlike centroid-only anchoring which only constrains translation.

const anchored = new Map();  // chainId → { rests, nodes, strength }

const SPRING_SOFT = 0.01;
const SPRING_FIXED = 0.4;

export function anchorChain(chainId, nodes, fixed) {
    const rests = new Map();
    for (const n of nodes) {
        rests.set(n, { x: n.x, y: n.y });
        n._centroidAnchored = true;
    }
    anchored.set(chainId, { rests, nodes, strength: fixed ? SPRING_FIXED : SPRING_SOFT });
}

export function releaseChain(chainId) {
    const entry = anchored.get(chainId);
    if (entry) {
        for (const n of entry.nodes) n._centroidAnchored = false;
        anchored.delete(chainId);
    }
}

export function releaseAllChains() {
    for (const { nodes } of anchored.values()) {
        for (const n of nodes) n._centroidAnchored = false;
    }
    anchored.clear();
}

export function isChainAnchored(chainId) {
    return anchored.has(chainId);
}

export function centroidAnchorForce() {
    return function force(_alpha) {
        for (const { rests, nodes, strength } of anchored.values()) {
            for (const n of nodes) {
                const rest = rests.get(n);
                if (!rest) continue;
                n.x += (rest.x - n.x) * strength;
                n.y += (rest.y - n.y) * strength;
            }
        }
    };
}
