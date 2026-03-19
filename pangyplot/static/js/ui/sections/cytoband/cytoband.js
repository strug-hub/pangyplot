import { setupChromosomeCytoband } from "./chromosome/cytoband-chromosome.js";
import { setupGenomeCytoband } from "./genome/cytoband-genome.js";
import { setupOtherChromosomeSelector } from "./other-chromosomes.js";

document.addEventListener("DOMContentLoaded", function () {
    setupGenomeCytoband();
    setupChromosomeCytoband();
    setupOtherChromosomeSelector();

});