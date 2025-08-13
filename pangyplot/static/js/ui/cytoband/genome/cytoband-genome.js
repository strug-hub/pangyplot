import { buildUrl, fetchData } from "../../../utils/network-utils.js";
import { organismToEmoji } from "./constants.js";
import { highlightGenomeCytoband } from "./selector.js";
import { drawGenomeCytoband } from "./painter.js";
import { fetchAndDrawChromosomeData } from "../chromosome/cytoband-chromosome.js";

import eventBus from "../../../utils/event-bus.js";

export function setupGenomeCytoband() {
    fetchAndDrawGenome(null);

    eventBus.subscribe("ui:coordinates-changed", function (data) {
        highlightGenomeCytoband(data.chromosome);
    });
 }

export function fetchAndDrawGenome(initialChrom) {
  const url = buildUrl("/cytoband", {});

  return fetchData(url, "genome cytoband fetch")
    .then(genomeData => {
      if (!genomeData) return;

      const chromOrder = genomeData.order || [];
      if (initialChrom == null && chromOrder.length > 0) {
        initialChrom = chromOrder[0];
      }

      updateGenomeCytoband(genomeData.chromosome, chromOrder, initialChrom, genomeData.organism);

      if (initialChrom != null) {
        return fetchAndDrawChromosomeData(initialChrom);
      }
    })
}

export function updateGenomeCytoband(genomeData, chromOrder, initialChrom, organism) {

    let indicator = document.getElementsByClassName("organism-indicator");
    for (let i = 0; i < indicator.length; i++) {
        indicator[i].textContent = organismToEmoji[organism] || "";
        indicator[i].title = organism;
        indicator[i].style.display = "block";
    }

    drawGenomeCytoband(genomeData, chromOrder)

    if (initialChrom != null){
        highlightGenomeCytoband(initialChrom);
    }
}
