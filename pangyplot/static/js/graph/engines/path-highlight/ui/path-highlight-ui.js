import { playAnimation, pauseAnimation, frameAdvance, frameBackward } from '../animation/animation-state.js';
import { changeAnimationSpeed } from '../animation/animation-tick.js';
import createPathTableElement from './path-table.js';

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
    const table = createPathTableElement(paths);

    const optionsContainer = document.getElementById("path-options-container");
    optionsContainer.classList.add("hidden");

    if (!table) return;
    
    table.addEventListener("pathselect", (e) => {
        optionsContainer.classList.remove("hidden");
        console.log(e.detail); // [{ index, item }]
    });

}

export function setupUi(samples){

    populateDropdown(samples);

    document.getElementById("path-play-button").addEventListener("click", function () {
        playAnimation();
        //todo "hold down"
    });
    document.getElementById("path-pause-button").addEventListener("click", function () {
        pauseAnimation();
    });
    document.getElementById("path-frame-forward-button").addEventListener("click", function () {
        frameAdvance();
    });
    document.getElementById("path-frame-reverse-button").addEventListener("click", function () {
        frameBackward();
    });

    const speedSlider = document.getElementById("path-speed-slider");
    const speedValue = document.getElementById("path-speed-value");
    speedSlider.addEventListener("input", function() {
        const speed = speedSlider.value;
        speedValue.textContent = speed;
        changeAnimationSpeed(speed);
    });

    

}
