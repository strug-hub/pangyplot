import { buildUrl, fetchData } from "../../../utils/network-utils.js";
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

export async function fetchAndDrawGenome(initialChrom) {
  const url = buildUrl("/cytoband", {});

  return fetchData(url, "genome cytoband fetch")
    .then(genomeData => {
      if (!genomeData) return;

      const chromOrder = genomeData.order || [];
      if (initialChrom == null && chromOrder.length > 0) {
        initialChrom = chromOrder[0];
      }

      updateGenomeCytoband(genomeData.chromosome, chromOrder, initialChrom);

      if (initialChrom != null) {
        return fetchAndDrawChromosomeData(initialChrom);
      }
    })
}

export function updateGenomeCytoband(genomeData, chromOrder, initialChrom) {

    drawGenomeCytoband(genomeData, chromOrder)

    if (initialChrom != null){
        highlightGenomeCytoband(initialChrom);
    }
}
