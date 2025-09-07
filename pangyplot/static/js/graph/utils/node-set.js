class NodeSet {
    constructor(name, nodes = []) {
        this.name = name;
        this.nodes = new Set(nodes);
        this.nodeValues = new Map(); // node -> {key: value, ...}
    }

    add(node, value = {}) {
        this.nodes.add(node);
        if (value && typeof value === 'object') {
            this.nodeValues.set(node, { ...value });
        } else {
            this.nodeValues.set(node, {});
        }
    }

    getAnyNode() {
        return this.nodes.values().next().value;
    }

    idList() {
        return [...this.nodes].map(node => node.id);
    }

    iidList() {
        return [...this.nodes].map(node => node.iid);
    }

    setValue(node, key, value) {
        if (this.nodes.has(node)) {
            let values = this.nodeValues.get(node) || {};
            values[key] = value;
            this.nodeValues.set(node, values);
        }
    }

    getValue(node, key) {
        const values = this.nodeValues.get(node);
        return values ? values[key] : undefined;
    }

    getAllValues(node) {
        return this.nodeValues.get(node) || {};
    }

    delete(node) {
        this.nodes.delete(node);
        this.nodeValues.delete(node);
    }

    has(node) {
        return this.nodes.has(node);
    }

    clear() {
        this.nodes.clear();
        this.nodeValues.clear();
    }

    isEmpty() {
        return this.nodes.size === 0;
    }

    get size() {
        return this.nodes.size;
    }

    forEach(callback) {
        this.nodes.forEach(node => {
            callback(node, this.nodeValues.get(node));
        });
    }
    
    [Symbol.iterator]() {
        return this.nodes[Symbol.iterator]();
    }

    sameNodes(otherSet) {
        if (this.size !== otherSet.size) return false;
        for (const node of this.nodes) {
            if (!otherSet.has(node)) {
                return false;
            }
        }
        return true;
    }


}

export default NodeSet;
