export default class GraphObjectRecord {
    constructor() {
        if (new.target === GraphObjectRecord) {
            throw new Error("Cannot instantiate abstract class GraphObjectRecord directly.");
        }

        this.elements = {nodes: [], links: []};
        this.hasElements = function() {
            return this.elements.nodes.length > 0 || this.elements.links.length > 0;
        }
        
        this.inside = new Set();
        Object.defineProperty(this, 'childRecords', {
            get: function() { return Array.from(this.inside);}
        });

        this.active = true;

    }
}