import { rgbStringToHex, stringToColor } from "../../../render/color/color-utils.js";

class AnnotationRecord {
    constructor(id, name) {
        if (new.target === AnnotationRecord) {
            throw new Error("Cannot instantiate abstract class AnnotationRecord directly.");
        }

        this.id = id;
        this.color = rgbStringToHex(stringToColor(name));
        this.name = name;
        this.isVisible = true;
    }

    toggleVisibility() {
        this.isVisible = !this.isVisible;
    }

    setVisibility(status) {
        this.isVisible = status;
    }
    
    setColor(color) {
        this.color = color;
    }
    
    getColor() {
        return this.color;
    }
    getName() {
        return this.name;
    }

}

export class GeneRecord extends AnnotationRecord {
    constructor({ id, gene, transcripts = [] }) {
        super(id, gene);

        this.transcripts = transcripts;
        this.showExons = false;
    }

    toggleExons() {
        this.showExons = !this.showExons;
    }

    setShowExons(status) {
        this.showExons = status;
    }

    hasTranscripts() {
        return this.transcripts.length > 0;
    }
    
    getPrimaryTranscript() {
        return this.hasTranscripts() ? this.transcripts[0] : null;
    }

    hasExons() {
        return this.hasTranscripts() && this.transcripts[0].exons?.length > 0;
    }

}

export class CustomAnnotationRecord extends AnnotationRecord {
    constructor(name, nodes = [] ) {
        const id = `custom-${Date.now()}`;
        super(id, name);
        this.nodes = nodes;
    }
}
