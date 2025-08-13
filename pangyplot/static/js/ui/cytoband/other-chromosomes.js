import { buildUrl, fetchData } from "../../utils/network-utils.js";
import eventBus from "../../utils/event-bus.js";

function checkIfOtherChromosomeInDropdown(input, datalist) {
    const chromosome = input.trim();
    for (let option of datalist.options) {
        let optionValue = option.value.trim();
        if (optionValue === chromosome) {
            return true;
        }
    }
    return false;
}

function populateOtherChromosomeDropdown(chromosomes, datalist) {
    chromosomes.forEach((chromosome) => {
        const option = document.createElement("option");
        option.value = chromosome;
        datalist.appendChild(option);
    });
}

export function setupOtherChromosomeSelector() {
    const datalist = document.getElementById("cytoband-genome-other-options");
    const inputSelector = document.getElementById("cytoband-genome-other-selector");
    const label = document.getElementById("cytoband-genome-other-selector-label");
  
    const url = buildUrl("/chromosomes", {noncanonical: true});

    fetchData(url, "get other chromosomes")
      .then(chromosomes => populateOtherChromosomeDropdown(chromosomes, datalist))

    inputSelector.addEventListener("input", function (event) {
        let chromosome = event.target.value;
        if (!checkIfOtherChromosomeInDropdown(chromosome, datalist)) {
            return;
        }
        const data = {chromosome, start: null, end: null, source: "cytoband-other"};
        eventBus.publish("ui:coordinates-changed", data);
    });
  
    eventBus.subscribe("ui:coordinates-changed", function (data) {
        if (checkIfOtherChromosomeInDropdown(data.chromosome, datalist)) {
          inputSelector.value = data.chromosome;
          label.classList.add("highlighted");
        } else {
          label.classList.remove("highlighted");
        }


        if (data.source === "cytoband-other") {
            inputSelector.value = data.chromosome;
            label.classList.add("highlighted");
        } else {
            label.classList.remove("highlighted");
        }
    });
}