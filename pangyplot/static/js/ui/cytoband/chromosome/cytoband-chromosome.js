import { addDragSelect } from "./drag-select.js";
import { drawChromosomeCytoband } from "./painter.js";
import { buildUrl, fetchData } from "../../../utils/network-utils.js";
import eventBus from "../../../utils/event-bus.js";

let selected_chr = null;
const cached_data = {};

export function setupChromosomeCytoband() {
    eventBus.subscribe("ui:coordinates-changed", function (data) {
        if (data.source === "cytoband-chromosome") return;
            fetchAndDrawChromosomeData(data.chromosome, data.start, data.end);
        }
    );
}

export function fetchAndDrawChromosomeData(chromosome, start, end) {
  if (chromosome in cached_data) {
    updateChromosomeCytoband(cached_data[chromosome], chromosome, start, end);
    return Promise.resolve();
  }

  // Include optional start/end if provided; otherwise only chromosome
  const params = { chromosome };
  if (start != null) params.start = start;
  if (end != null) params.end = end;

  const url = buildUrl("/cytoband", params);

  return fetchData(url, `chromosome cytoband fetch: ${chromosome}`)
    .then(chrBands => {
      if (!chrBands) return;

      cached_data[chromosome] = chrBands;
      updateChromosomeCytoband(chrBands, chromosome, start, end);
    })
    .catch(error => {
      console.error("Fetch error:", error);
    });
}

function updateChromosomeCytoband(chromData, chromosome, start, end) {
  const canvasContainer = document.getElementById("cytoband-chromosome-canvas-container");
  const missingInfo = document.getElementById("cytoband-chromosome-no-info");

  canvasContainer.innerHTML = "";

  if (!chromData) {
    selected_chr = null;
    missingInfo.style.display = "block";
    return;
  }

  selected_chr = chromosome;
  missingInfo.style.display = "none";

  const size = Math.max(...chromData.map(d => d.end));
  const svg = drawChromosomeCytoband(chromData);
  addDragSelect(svg, size, chromosome, start, end);
}

