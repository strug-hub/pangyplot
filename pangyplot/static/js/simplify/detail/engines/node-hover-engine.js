// Bubble and force-node hover detection and tooltip formatting.

import { state } from '../../simplify-state.js';
import { getForceNodes } from '../data/force-data.js';

const HIT_RADIUS_PX = 12;

export function hitTestBubbles(dataX, dataY) {
    if (!state.detailData || !state.detailData.bubbles || state.detailOpacity < 0.5) return null;
    const margin = HIT_RADIUS_PX / state.zoom;
    for (const b of state.detailData.bubbles) {
        const dx = (dataX - b.x) / (b.rx + margin);
        const dy = (dataY - b.y) / (b.ry + margin);
        if (dx * dx + dy * dy <= 1) return b;
    }
    return null;
}

export function hitTestForceNodes(dataX, dataY) {
    if (state.detailOpacity < 0.5) return null;
    const nodes = getForceNodes();
    if (nodes.length === 0) return null;

    const hitR = HIT_RADIUS_PX / state.zoom;
    let bestDist = hitR;
    let bestNode = null;

    for (const node of nodes) {
        if (node.isPhantom || node.isPolychainNode) continue;
        const dx = dataX - node.x;
        const dy = dataY - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nodeR = (node.width || 6) / (2 * state.zoom);
        const threshold = Math.max(nodeR, hitR);
        if (dist < threshold && dist < bestDist) {
            bestDist = dist;
            bestNode = node;
        }
    }
    return bestNode;
}

export function getForceNodeTooltip(node) {
    if (node.chainId === '__junction__') {
        return {
            segment: node.recordId || node.id,
            length: node.seqLength,
        };
    }
    return {
        [node.type]: node.recordId || node.id,
        length: node.seqLength,
        chain: node.chainId,
    };
}

export function getBubbleTooltip(b) {
    return {
        bubble: b.id,
        type: b.subtype,
        length: b.length,
        chain: b.chain,
    };
}
