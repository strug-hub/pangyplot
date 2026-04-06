// Pop hierarchy tracker: maintains a tree of which bubble pops created which
// child structures, plus a LIFO undo stack for Ctrl+Z.
// Replaces the flat state._bubblePopStack.

/**
 * @typedef {Object} PopNode
 * @property {string} bubbleId
 * @property {string} chainId
 * @property {string|null} parentBubbleId
 * @property {Set<string>} children - bubbleIds of pops nested inside this one
 * @property {Object} popEntry - undo data (same shape as old _bubblePopStack entries)
 * @property {number} depth - 0 for root pops, increments for nested
 */

class PopTree {
    constructor() {
        /** @type {Map<string, PopNode>} */
        this.pops = new Map();
        /** @type {Set<string>} */
        this.roots = new Set();
        /** @type {string[]} bubbleIds in LIFO order */
        this.undoStack = [];
    }

    /**
     * Register a new pop in the tree.
     * @param {string} bubbleId
     * @param {string} chainId
     * @param {string|null} parentBubbleId - null for root pops
     * @param {Object} popEntry - undo data
     */
    register(bubbleId, chainId, parentBubbleId, popEntry) {
        const depth = parentBubbleId && this.pops.has(parentBubbleId)
            ? this.pops.get(parentBubbleId).depth + 1
            : 0;

        const node = {
            bubbleId,
            chainId,
            parentBubbleId,
            children: new Set(),
            popEntry,
            depth,
        };

        this.pops.set(bubbleId, node);
        this.undoStack.push(bubbleId);

        if (parentBubbleId && this.pops.has(parentBubbleId)) {
            this.pops.get(parentBubbleId).children.add(bubbleId);
        } else {
            this.roots.add(bubbleId);
        }
    }

    /**
     * Undo the most recent pop. Returns the popEntry or null.
     */
    undoLast() {
        if (this.undoStack.length === 0) return null;

        const bubbleId = this.undoStack.pop();
        const node = this.pops.get(bubbleId);
        if (!node) return null;

        // Remove from parent's children
        if (node.parentBubbleId && this.pops.has(node.parentBubbleId)) {
            this.pops.get(node.parentBubbleId).children.delete(bubbleId);
        } else {
            this.roots.delete(bubbleId);
        }

        this.pops.delete(bubbleId);
        return node.popEntry;
    }

    /** Get the parent bubbleId of a pop, or null. */
    getParent(bubbleId) {
        const node = this.pops.get(bubbleId);
        return node ? node.parentBubbleId : null;
    }

    /** Get child bubbleIds of a pop. */
    getChildren(bubbleId) {
        const node = this.pops.get(bubbleId);
        return node ? [...node.children] : [];
    }

    /** Get the nesting depth of a pop (0 = root). */
    getDepth(bubbleId) {
        const node = this.pops.get(bubbleId);
        return node ? node.depth : -1;
    }

    /** Check if a bubble has been popped. */
    has(bubbleId) {
        return this.pops.has(bubbleId);
    }

    /** Number of active pops. */
    get size() {
        return this.pops.size;
    }

    /** Clear all pop state. */
    clear() {
        this.pops.clear();
        this.roots.clear();
        this.undoStack.length = 0;
    }
}

const popTree = new PopTree();
export default popTree;
