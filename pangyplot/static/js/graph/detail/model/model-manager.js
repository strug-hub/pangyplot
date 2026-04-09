/**
 * ModelManager — central coordinator for the SimObject model layer.
 *
 * Manages all PolychainContainers and loose SimObjects (segments, bubbles).
 * Containers are created by polychain-adapter during init and added via
 * addContainer(). Objects are added during pop/init via addObject().
 */

import * as registry from './segment-registry.js';
import popTree from '../data/pop-tree.js';

// All active PolychainContainers, keyed by root chain ID
const containers = new Map();

// All active SimObjects (PolychainSegments, SegmentObjects, BubbleObjects), keyed by ID
const objects = new Map();

// Debug access
window.__simContainers = () => containers;
window.__simObjects = () => objects;
window.__simRegistry = registry;

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

/** Remove a PolychainContainer, its segments, and pop children. */
export function removeContainer(chainId) {
    const c = containers.get(chainId);
    if (c) {
        for (const seg of c.segments) objects.delete(seg.id);
        for (const obj of c.popChildren) objects.delete(obj.id);
        c.destroy();
        containers.delete(chainId);
        popTree.clearByChainId(chainId);
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

/**
 * Compute gene overlaps for all SimObjects.
 * Call when gene pins are first available or objects are created.
 * @param {object[]} genePins — array of GenePin objects with startBp, endBp
 */
export function computeAllGeneOverlaps(genePins) {
    for (const obj of objects.values()) {
        obj.computeGeneOverlaps(genePins);
    }
}

/**
 * Collect gene annotation renderables from all SimObjects.
 * @returns {object[]} — flat array of render specs
 */
export function collectGeneRenderables() {
    const specs = [];
    for (const obj of objects.values()) {
        const r = obj.getGeneRenderables();
        if (r.length > 0) specs.push(...r);
    }
    return specs;
}

