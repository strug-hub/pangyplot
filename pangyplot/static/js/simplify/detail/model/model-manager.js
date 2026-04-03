/**
 * ModelManager — central coordinator for the SimObject model layer.
 *
 * Manages all PolychainContainers and loose SimObjects (segments, bubbles).
 * Provides the integration point between the new model and the existing
 * force engine / rendering system.
 *
 * During migration, this runs alongside the old polychain-adapter and
 * seg-registry. Once migration is complete, it replaces them.
 */

import { createContainerFromChain, createObjectsFromPop, markDeletionLinks, resolveApiLink }
    from './polychain-factory.js';
import * as registry from './segment-registry.js';

// All active PolychainContainers, keyed by root chain ID
const containers = new Map();

// All active loose SimObjects (segments, bubbles from pops), keyed by object ID
const looseObjects = new Map();

// Debug access
window.__simContainers = () => containers;
window.__simObjects = () => looseObjects;
window.__simRegistry = registry;

// --- Initialization ---

/**
 * Initialize the model layer from /detail-tiles response.
 * Creates PolychainContainers for all chains.
 *
 * @param {object} detailData — parsed /detail-tiles response
 *   (expects .chains array with polyline, sourceSegs, sinkSegs, etc.)
 */
export function initModel(detailData) {
    clearModel();

    for (const chain of (detailData.chains || [])) {
        const container = createContainerFromChain(chain);
        if (container) {
            containers.set(container.id, container);
        }
    }
}

/**
 * Clear all model state.
 */
export function clearModel() {
    for (const c of containers.values()) c.destroy();
    containers.clear();
    for (const obj of looseObjects.values()) obj.destroy(registry);
    looseObjects.clear();
    registry.clear();
}

// --- Per-frame update ---

/**
 * Update all container anchors. Call each frame (force tick or pre-render).
 */
export function updateAnchors() {
    for (const c of containers.values()) {
        c.updateAnchors();
    }
}

// --- Pop ---

/**
 * Pop a bubble circle on a polychain.
 *
 * 1. Fetch /pop API (caller provides apiData)
 * 2. Split the container's segment
 * 3. Create child SimObjects
 * 4. Return everything the force engine needs to add/remove
 *
 * @param {object} opts
 * @param {string} opts.chainId       — chain containing the bubble
 * @param {string} opts.bubbleId      — bubble ID (e.g. "b123")
 * @param {number} opts.tPosition     — normalized t of the bubble on the chain
 * @param {number} opts.tWidth        — width of gap in t-space
 * @param {object} opts.apiData       — /pop response
 * @param {{ x: number, y: number }} opts.spawnPos — bubble circle position
 * @returns {object|null} — { addNodes, addLinks, removeNodes, splitResult }
 */
export function popBubbleOnChain(opts) {
    const { chainId, bubbleId, tPosition, tWidth, apiData, spawnPos } = opts;

    // Find the container (could be root or the root of a subchain)
    const rootId = chainId.split(':')[0];
    const container = containers.get(rootId);
    if (!container) {
        console.warn(`[model-manager] No container for chain ${rootId}`);
        return null;
    }

    // Mark deletion links on the API data
    markDeletionLinks(apiData, bubbleId);

    // Split the container's segment at the bubble position
    const sourceSegs = (apiData.source_segs || []).map(s => `s${s}`);
    const sinkSegs = (apiData.sink_segs || []).map(s => `s${s}`);
    const splitResult = container.splitAtBubble(bubbleId, tPosition, tWidth, sourceSegs, sinkSegs);

    // Create child SimObjects from the pop response
    const { segments, bubbles } = createObjectsFromPop(apiData, rootId, spawnPos);

    // Track loose objects
    for (const obj of [...segments, ...bubbles]) {
        looseObjects.set(obj.id, obj);
    }

    // Collect physics nodes/links to add to sim
    const addNodes = [];
    const addLinks = [];
    for (const obj of [...segments, ...bubbles]) {
        addNodes.push(...obj.physicsNodes);
        addLinks.push(...obj.physicsLinks);
    }
    // Add new segment anchors
    addNodes.push(...splitResult.leftSegment.physicsNodes);
    addNodes.push(...splitResult.rightSegment.physicsNodes);

    // Collect nodes to remove (old segment's anchors)
    const removeNodes = splitResult.removedSegment.physicsNodes.map(n => n.iid);

    // Resolve GFA links from the pop response through the registry
    for (const rawLink of (apiData.links || [])) {
        const resolved = resolveApiLink(rawLink);
        if (!resolved) continue;

        addLinks.push({
            source: resolved.fromNode,
            target: resolved.toNode,
            isGfaLink: true,
            isKinkLink: false,
            isDel: resolved.isDeletion,
            fromStrand: rawLink.from_strand || '+',
            toStrand: rawLink.to_strand || '+',
            frequency: rawLink.frequency || 0,
            haplotype: rawLink.haplotype || null,
            length: 10,
            width: resolved.isDeletion ? 1 : 1,
        });
    }

    return {
        addNodes,
        addLinks,
        removeNodes,
        splitResult,
        childObjects: [...segments, ...bubbles],
    };
}

/**
 * Unpop a bubble on a chain — reverse of popBubbleOnChain.
 *
 * @param {object} opts
 * @param {string} opts.chainId
 * @param {string} opts.bubbleId
 * @param {string[]} opts.childObjectIds — IDs of objects created by the pop
 * @returns {object|null} — { removeNodes, addNodes, mergeResult }
 */
export function unpopBubbleOnChain(opts) {
    const { chainId, bubbleId, childObjectIds } = opts;

    const rootId = chainId.split(':')[0];
    const container = containers.get(rootId);
    if (!container) return null;

    // Collect nodes to remove (child objects' physics nodes)
    const removeNodes = [];
    for (const objId of (childObjectIds || [])) {
        const obj = looseObjects.get(objId);
        if (obj) {
            removeNodes.push(...obj.physicsNodes.map(n => n.iid));
            obj.destroy(registry);
            looseObjects.delete(objId);
        }
    }

    // Merge the container's segments back
    const mergeResult = container.mergeAtBubble(bubbleId);

    // Remove old split segment anchors, add merged segment anchors
    const removeAnchorIids = [];
    for (const seg of mergeResult.removedSegments) {
        removeAnchorIids.push(...seg.physicsNodes.map(n => n.iid));
    }

    const addNodes = [...mergeResult.mergedSegment.physicsNodes];

    return {
        removeNodes: [...removeNodes, ...removeAnchorIids],
        addNodes,
        mergeResult,
    };
}

// --- Accessors ---

/** Get a PolychainContainer by root chain ID. */
export function getContainer(chainId) {
    const rootId = chainId.split(':')[0];
    return containers.get(rootId) ?? null;
}

/** Get all containers. */
export function getAllContainers() {
    return containers;
}

/** Get a loose SimObject by ID. */
export function getObject(objectId) {
    return looseObjects.get(objectId) ?? null;
}

/** Get all loose objects. */
export function getAllObjects() {
    return looseObjects;
}

/** Get all physics nodes from all containers (spine + anchors). */
export function getAllContainerNodes() {
    const nodes = [];
    for (const c of containers.values()) {
        nodes.push(...c.spineNodes);
        nodes.push(...c.getAllAnchorNodes());
    }
    return nodes;
}

/** Get all spine links from all containers. */
export function getAllSpineLinks() {
    const links = [];
    for (const c of containers.values()) {
        links.push(...c.spineLinks);
    }
    return links;
}

/** Get all renderables from all containers + segments + loose objects. */
export function getAllRenderables() {
    const specs = [];
    for (const c of containers.values()) {
        specs.push(...c.getRenderables());
        for (const seg of c.segments) {
            specs.push(...seg.getRenderables());
        }
    }
    for (const obj of looseObjects.values()) {
        specs.push(...obj.getRenderables());
    }
    return specs;
}
