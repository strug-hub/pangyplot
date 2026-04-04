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

import { createContainerFromChain } from './polychain-factory.js';
import * as registry from './segment-registry.js';

// All active PolychainContainers, keyed by root chain ID
const containers = new Map();

// All active SimObjects (PolychainSegments, SegmentObjects, BubbleObjects), keyed by ID
const objects = new Map();

// Debug access
window.__simContainers = () => containers;
window.__simObjects = () => objects;
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
            // Register the initial PolychainSegment
            for (const seg of container.segments) {
                objects.set(seg.id, seg);
            }
        }
    }
}

/**
 * Clear all model state.
 */
export function clearModel() {
    for (const c of containers.values()) c.destroy();
    containers.clear();
    objects.clear();
    registry.clear();
}

// --- Object store ---

/** Add a SimObject to the store. */
export function addObject(obj) {
    objects.set(obj.id, obj);
}

/** Remove a SimObject from the store and destroy it (unregisters ends). */
export function removeObject(id) {
    const obj = objects.get(id);
    if (obj) {
        obj.destroy(registry);
        objects.delete(id);
    }
}

/** Remove a SimObject from the store WITHOUT unregistering ends.
 *  Used by undo — the restored segment will re-register shared ends. */
export function forgetObject(id) {
    objects.delete(id);
}

/** Get a SimObject by ID. */
export function getObject(id) {
    return objects.get(id) ?? null;
}

// --- Per-frame update ---

/**
 * Update all segment anchors. Each segment pulls its positions from
 * its container's live spine. Call each frame (force tick).
 */
export function updateAnchors() {
    for (const c of containers.values()) {
        for (const seg of c.segments) {
            seg.updateAnchors();
        }
    }
}

// --- Accessors ---

/** Add a PolychainContainer to the store. */
export function addContainer(container) {
    containers.set(container.id, container);
    for (const seg of container.segments) {
        objects.set(seg.id, seg);
    }
}

/** Remove a PolychainContainer and its segments. */
export function removeContainer(chainId) {
    const c = containers.get(chainId);
    if (c) {
        for (const seg of c.segments) objects.delete(seg.id);
        c.destroy();
        containers.delete(chainId);
    }
}

/** Get a PolychainContainer by root chain ID. */
export function getContainer(chainId) {
    return containers.get(chainId) ?? null;
}

/** Get all containers. */
export function getAllContainers() {
    return containers;
}

/** Get all SimObjects. */
export function getAllObjects() {
    return objects;
}

