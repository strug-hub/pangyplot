// Centroid anchor force: pins a chain's center of mass to a fixed point
// while allowing individual polychain nodes to flex under other forces.

const anchored = new Map();  // chainId → { cx, cy, nodes }

export function anchorChain(chainId, nodes) {
    let cx = 0, cy = 0;
    for (const n of nodes) {
        cx += n.x;
        cy += n.y;
        n._centroidAnchored = true;
    }
    cx /= nodes.length;
    cy /= nodes.length;
    anchored.set(chainId, { cx, cy, nodes });
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
        for (const { cx, cy, nodes } of anchored.values()) {
            let curCx = 0, curCy = 0;
            for (const n of nodes) {
                curCx += n.x;
                curCy += n.y;
            }
            curCx /= nodes.length;
            curCy /= nodes.length;

            const dx = cx - curCx;
            const dy = cy - curCy;

            for (const n of nodes) {
                n.x += dx;
                n.y += dy;
            }
        }
    };
}
