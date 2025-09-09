export class Record {
    constructor() {
        if (new.target === Record) {
            throw new Error("Cannot instantiate abstract class Record directly.");
        }

        this.elements = {nodes: [], links: []};
        this.hasElements = function() {
            return this.elements.nodes.length > 0 || this.elements.links.length > 0;
        }
        
        this.inside = new Set();
        this.active = true;

    }
}