// Debug logger for bubble pop events. Posts structured entries to
// /debug-log which writes to pop-debug-logs/session-{id}.jsonl.
// A new session ID is generated on each page load.

const SESSION_ID = Date.now().toString(36);
let _enabled = true;

export function enablePopDebug(on = true) { _enabled = on; }
export function getSessionId() { return SESSION_ID; }

function post(entry) {
    if (!_enabled) return;
    fetch('/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: SESSION_ID, ...entry }),
    }).catch(() => {});
}

export function logPop(bubbleId, chainId, data) {
    post({ event: 'POP', bubbleId, chainId, ...data });
}

export function logUnpop(bubbleId, chainId, data) {
    post({ event: 'UNPOP', bubbleId, chainId, ...data });
}

export function logGap(chainId, gapEntry, label) {
    post({
        event: 'GAP', label, chainId,
        bubbleId: gapEntry.bubbleId,
        leftNodeIdx: gapEntry.leftNodeIdx,
        rightNodeIdx: gapEntry.rightNodeIdx,
        tStart: gapEntry.tStart,
        tEnd: gapEntry.tEnd,
        anchorL: gapEntry.anchorL?.iid,
        anchorR: gapEntry.anchorR?.iid,
        leftCreated: gapEntry.leftCreated,
        rightCreated: gapEntry.rightCreated,
    });
}

export function logNodes(label, nodes) {
    post({
        event: 'NODES', label,
        count: nodes.length,
        items: nodes.slice(0, 30).map(n => ({
            iid: n.iid, id: n.id,
            x: Math.round(n.x), y: Math.round(n.y),
            isAnchor: !!n.isAnchor,
            isPolychainNode: !!n.isPolychainNode,
            chainId: n.chainId,
        })),
    });
}

export function logLinks(label, links) {
    post({
        event: 'LINKS', label,
        count: links.length,
        items: links.slice(0, 30).map(l => ({
            source: l.source?.iid ?? l.source,
            target: l.target?.iid ?? l.target,
            isBridgeLink: !!l.isBridgeLink,
            isPolychainLink: !!l.isPolychainLink,
            isGapLink: !!l.isGapLink,
            length: l.length != null ? Math.round(l.length) : null,
        })),
    });
}

export function logChainState(chainId, nodes, gaps) {
    post({
        event: 'CHAIN_STATE', chainId,
        nodeCount: nodes ? nodes.length : 0,
        nodeList: nodes ? nodes.map(n => ({
            iid: n.iid, idx: n.nodeIndex, isAnchor: !!n.isAnchor,
        })) : [],
        gapCount: gaps ? gaps.length : 0,
        gaps: gaps ? gaps.map(g => ({
            bubbleId: g.bubbleId,
            leftIdx: g.leftNodeIdx, rightIdx: g.rightNodeIdx,
            anchorL: g.anchorL?.iid, anchorR: g.anchorR?.iid,
            tStart: g.tStart, tEnd: g.tEnd,
        })) : [],
    });
}
