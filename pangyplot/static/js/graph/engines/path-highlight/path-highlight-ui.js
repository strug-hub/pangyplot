import createSelectableTable from '../../../ui/utils/selectable-table.js';
import setupAnimationUi from './animation/animation-ui.js';
import { setAnimationPath } from './animation/animation-tick.js';

export function populateDropdown(samples){
    const pathSelector = document.getElementById('path-selector');

    const blankOpt = document.createElement("option");
    blankOpt.value = "";
    blankOpt.textContent = "Select a sample...";
    blankOpt.selected = true;
    blankOpt.disabled = true;
    pathSelector.appendChild(blankOpt);

    samples.forEach(function (id, index) {
        var opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        opt.setAttribute('data-index', index);
        pathSelector.appendChild(opt);
    });
}

export function updateStepDisplay(step){
    if (step < 0) step = null;
    const stepDisplay = document.getElementById("path-current-step");
    stepDisplay.textContent = step !== null ? step : "N/A";
}

export function createPathList(paths){
    const optionsContainer = document.getElementById("path-animation-container");
    optionsContainer.classList.add("hidden");

    const pathContainer = document.getElementById("path-table-container");
    pathContainer.innerHTML = "";
    pathContainer.classList.remove("no-data");

    if (!paths?.length) {
        pathContainer.textContent = "No path data available.";
        pathContainer.classList.add("no-data");
        return;
    }

    const tableData = [];
    paths.forEach((subpath) => {
        tableData.push({
            item: subpath,
            label: `${subpath.contig}:${subpath.start}-${subpath.start + subpath.length}`
        });
    });

    const table = createSelectableTable("path", tableData, "Subpaths");

    pathContainer.appendChild(table);

    table.addEventListener("path-row-select", (e) => {
        optionsContainer.classList.remove("hidden");
        setAnimationPath(e.detail.item);
    });

}

export function setupUi(samples){

    populateDropdown(samples);
    setupAnimationUi();

}
