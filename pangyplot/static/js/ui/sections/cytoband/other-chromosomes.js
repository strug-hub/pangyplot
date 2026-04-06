import { buildUrl, fetchData } from "../../../utils/network-utils.js";
import eventBus from '@event-bus';

function populateOtherChromosomeDropdown(chromosomes, select) {
    chromosomes.forEach((chromosome) => {
        const option = document.createElement("option");
        option.value = chromosome;
        option.textContent = chromosome;
        select.appendChild(option);
    });
}

export function setupOtherChromosomeSelector() {
    const select = document.getElementById("cytoband-genome-other-selector");
    const label = document.getElementById("cytoband-genome-other-selector-label");

    const url = buildUrl("/chromosomes", {noncanonical: true});

    fetchData(url, "get other chromosomes")
      .then(chromosomes => populateOtherChromosomeDropdown(chromosomes, select));

    select.addEventListener("change", function () {
        const chromosome = select.value;
        if (!chromosome) return;
        const data = {chromosome, start: null, end: null, source: "cytoband-other"};
        eventBus.publish("ui:coordinates-changed", data);
    });

    eventBus.subscribe("ui:coordinates-changed", function (data) {
        const options = Array.from(select.options);
        const match = options.some(opt => opt.value === data.chromosome);

        if (match) {
            select.value = data.chromosome;
            label.classList.add("highlighted");
        } else {
            select.value = "";
            label.classList.remove("highlighted");
        }
    });
}
