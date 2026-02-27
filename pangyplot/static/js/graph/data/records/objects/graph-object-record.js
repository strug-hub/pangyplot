export default class GraphObjectRecord {
    constructor() {
        if (new.target === GraphObjectRecord) {
            throw new Error("Cannot instantiate abstract class GraphObjectRecord directly.");
        }

        this.elements = {nodes: [], links: []};
        this.inside = new Set();
        this.active = true;
    }

    get childRecords() {
        return Array.from(this.inside);
    }

    hasElements() {
        return this.elements.nodes.length > 0 || this.elements.links.length > 0;
    }
}
