// Adapter: undo a bubble pop in the simplify force simulation.
// Reads popData from the popTree undo stack, removes child nodes,
// re-adds the parent bubble node with saved external links, and
// collapses simplifyViewState.

import { state } from '../../simplify-state.js';
import { unspliceBubbleNodes, unspliceChainAtBubble, addPoppedNodes, removePoppedContent } from '../engines/force-engine.js';
import simplifyViewState from './simplify-view-state.js';
import { restoreBubbleToStore, mergeBubbleStores } from './bubble-meta-cache.js';
import { mergeSubchainsOnUnpop, restoreChain, removeGhostSpine, hasGhostSpine, removeGap } from './polychain/polychain-adapter.js';
import popTree from './pop-tree.js';
import { getContainer } from '../model/model-manager.js';
import * as modelRegistry from '../model/segment-registry.js';

/**
 * Undo the most recent bubble pop. Returns true on success.
 */
export function unpopLastBubble() {
    const popEntry = popTree.undoLast();
    if (!popEntry) return false;

    // Anchor-based pop (new architecture)
    if (popEntry.isAnchorPop) {
        return unpopAnchor(popEntry);
    }

    // Legacy chain-split pop
    if (popEntry.isChainSplitPop) {
        return unpopChainSplit(popEntry);
    }

    // Original force-node pop
    return unpopForceNode(popEntry);
}

function unpopAnchor(popEntry) {
    const {
        bubbleId,
        chainId,
        parentRecord,
        childIids,
        sourceSegs,
        sinkSegs,
        childBubbles,
        gapInfo,
        bubbleMeta,
        childObjectIds,
    } = popEntry;

    // Remove child nodes and their links from the sim
    removePoppedContent(childIids);

    // Remove gap entry (no anchor nodes to remove — boundaries are existing polychain nodes)
    removeGap(chainId, gapInfo.gapEntry);

    // Unregister child objects from model registry (V2 path)
    if (childObjectIds) {
        for (const objId of childObjectIds) {
            // Unregister ends — the object is going back inside the bubble
            const normalized = String(objId).startsWith('s') || String(objId).startsWith('b')
                ? objId : `s${objId}`;
            modelRegistry.unregister(normalized);
        }
    }

    // Merge container segments back (V2 path)
    const container = getContainer(chainId);
    if (container) {
        try {
            container.mergeAtBubble(bubbleId);
        } catch (e) {
            console.warn('[unpop] container merge failed:', e.message);
        }
    }

    // Collapse simplify viewState (old path — skipped if parentRecord is null from V2)
    if (parentRecord) {
        simplifyViewState.collapse(
            parentRecord,
            sourceSegs,
            sinkSegs,
            [],
            childBubbles,
        );
    }

    // Restore the bubble circle in the meta cache
    if (bubbleMeta) {
        restoreBubbleToStore(chainId, bubbleMeta);
    }

    return true;
}

function unpopChainSplit(popEntry) {
    const {
        bubbleId,
        chainId,
        parentRecord,
        childIids,
        sourceSegs,
        sinkSegs,
        childBubbles,
        removedLink,
        bridgeLinks,
        splitResult,
        tSplit,
        bubbleMeta,
        chainRemoval,
    } = popEntry;

    // If any subchains were removed (fully popped), restore them first
    if (chainRemoval) {
        for (const removal of chainRemoval) {
            // Un-rewire external links back to polychain nodes
            for (const { link, oldSource, oldTarget } of removal.rewiredLinks) {
                if (oldSource) link.source = oldSource;
                if (oldTarget) link.target = oldTarget;
            }
            restoreChain(removal.id, removal);
            if (removal.removedNodes.length > 0) {
                addPoppedNodes(removal.removedNodes, removal.removedBridgeLinks || []);
            }
        }
    }

    // Merge subchain bubble stores back into parent store
    if (splitResult) {
        mergeBubbleStores(splitResult.leftChain.id, splitResult.rightChain.id, chainId, tSplit);
    }

    // Merge the two subchains back into the parent chain
    if (splitResult) {
        mergeSubchainsOnUnpop(
            splitResult.leftChain.id, splitResult.rightChain.id,
            splitResult.parentChain, splitResult.parentIndex);
    }

    // Remove child nodes and bridge links, restore the polychain link
    unspliceChainAtBubble(childIids, removedLink, bridgeLinks);

    // Collapse simplify viewState
    if (parentRecord) {
        simplifyViewState.collapse(
            parentRecord,
            sourceSegs,
            sinkSegs,
            [],  // insideSegs not tracked for chain-split pops
            childBubbles,
        );
    }

    // Restore the bubble circle in the meta cache
    if (bubbleMeta) {
        restoreBubbleToStore(chainId, bubbleMeta);
    }

    // If the restored chain is the root (no colon in chainId), the ghost
    // spine is no longer needed — the original chain is fully restored.
    const rootId = chainId.split(':')[0];
    if (chainId === rootId && hasGhostSpine(rootId)) {
        removeGhostSpine(rootId);
    }

    return true;
}

function unpopForceNode(popEntry) {
    const {
        bubbleId,
        chainId,
        parentRecord,
        parentNode,
        childIids,
        externalLinks,
        sourceSegs,
        sinkSegs,
        childBubbles,
        insideSegs,
    } = popEntry;

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

    const childIidSet = new Set(childIids);
    unspliceBubbleNodes(childIidSet, parentNodes, [...parentLinks, ...externalLinks]);

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
