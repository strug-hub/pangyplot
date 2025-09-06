import { rgbStringToHex, stringToColor } from "../../render/color/color-utils.js";

export class Gene {
    constructor({ id, gene, transcripts = [], color = null, isCustom = false }) {
        this.id = id;
        this.name = gene;
        this.transcripts = transcripts;
        this.color = color || rgbStringToHex(stringToColor(gene));

        this.isVisible = true;
        this.showExons = false;

        this.isCustom = isCustom || false;
    }

    toggleVisibility() {
        this.isVisible = !this.isVisible;
    }

    setVisibility(status) {
        this.isVisible = status;
    }

    toggleExons() {
        this.showExons = !this.showExons;
    }

    setExons(status) {
        this.showExons = status;
    }

    setColor(color) {
        this.color = color;
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

    getColor() {
        return this.color;
    }

    getName() {
        return this.name;
    }
}
