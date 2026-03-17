// Adapter: undo a bubble pop in the simplify force simulation.
// Reads popData from the _bubblePopStack, removes child nodes,
// re-adds the parent bubble node, rewires links back, and
// collapses simplifyViewState.

import { state } from '../../simplify-state.js';
import { unspliceBubbleNodes } from '../engines/force-engine.js';
import simplifyViewState from './simplify-view-state.js';

/**
 * Undo the most recent bubble pop. Returns true on success.
 */
export function unpopLastBubble() {
    if (!state._bubblePopStack || state._bubblePopStack.length === 0) return false;

    const popEntry = state._bubblePopStack.pop();
    const {
        bubbleId,
        chainId,
        parentRecord,
        parentNode,
        childIids,
        rewireMap,
        sourceSegs,
        sinkSegs,
        childBubbles,
        insideSegs,
    } = popEntry;

    // Build reverse rewire map: child kink iid → parent kink iid
    const reverseRewireMap = new Map();
    for (const [parentIid, childIid] of rewireMap) {
        reverseRewireMap.set(childIid, parentIid);
    }

    // Reconstruct the parent bubble's kink nodes from its record
    const parentKinks = popEntry.parentKinks;
    const parentNodes = [];
    for (let i = 0; i < parentKinks; i++) {
        const kinkNode = {
            ...parentNode,
            iid: `${bubbleId}#${i}`,
            idx: i,
            kinks: parentKinks,
            isEnd: (i === 0 || i === parentKinks - 1),
            isSingleton: parentKinks === 1,
            chainId,
        };
        // Restore position from the original parent node
        kinkNode.x = parentNode.x + (i * 5);
        kinkNode.y = parentNode.y;
        parentNodes.push(kinkNode);
    }

    // Rebuild parent's intra-kink links
    const parentLinks = [];
    for (let i = 1; i < parentKinks; i++) {
        const sourceIid = `${bubbleId}#${i - 1}`;
        const targetIid = `${bubbleId}#${i}`;
        parentLinks.push({
            isNode: false,
            isLink: true,
            class: 'node',
            id: bubbleId,
            iid: `${sourceIid}+${targetIid}+`,
            type: 'bubble',
            source: sourceIid,
            target: targetIid,
            sourceIid,
            targetIid,
            isKinkLink: true,
            chainId,
            isDrawn: true,
            width: 5,
            length: 10,
        });
    }

    // Atomic unsplice: remove children, rewire links back, add parent
    const childIidSet = new Set(childIids);
    unspliceBubbleNodes(childIidSet, reverseRewireMap, parentNodes, parentLinks);

    // Collapse simplify viewState: re-register parent bubble, unmap children
    if (parentRecord) {
        simplifyViewState.collapse(
            parentRecord,
            sourceSegs,
            sinkSegs,
            insideSegs,
            childBubbles,
        );
    }

    return true;
}
