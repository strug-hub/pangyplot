class NodeSet {
    constructor(name, nodes = []) {
        this.name = name;
        this.nodes = new Set(nodes);
        this.nodeValues = new Map();
    }

    add(node, value = undefined) {
        this.nodes.add(node);
        this.nodeValues.set(node, value);
    }

    addAll(nodes, values = []) {
        nodes.forEach((node, index) => {
            const value = values[index];
            this.add(node, value);
        });
    }

    getAnyNode() {
        if (this.nodes.size === 0) return null;
        return this.nodes.values().next().value;
    }

    nodeList() {
        return [...this.nodes];
    }

    idSet() {
        return new Set([...this.nodes].map(node => node.id));
    }

    iidList() {
        return [...this.nodes].map(node => node.iid);
    }

    setValue(node, value) {
        if (this.nodes.has(node)) {
            this.nodeValues.set(node, value);
        }
    }

    getValue(node) {
        return this.nodeValues.get(node);
    }

    getAllValues(node) {
        return this.nodeValues.get(node);
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

    *nodeValuePairs() {
        for (const node of this.nodes) {
            yield [node, this.nodeValues.get(node)];
        }
    }

    contains(nodes){
        if (!Array.isArray(nodes)) {
            return this.has(nodes);
        }
        for (const node of nodes) {
            if (!this.has(node)) return false;
        }
        return true;
    }

}

export default NodeSet;
