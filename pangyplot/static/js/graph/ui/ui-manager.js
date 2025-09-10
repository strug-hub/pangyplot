import eventBus from "../../utils/event-bus.js";
import { canvasSize } from "./ui-canvas-size.js";

function scrollIntoView() {
    const graphContainer = document.getElementById('graph-container')
    graphContainer.scrollIntoView({ behavior: 'smooth' });
}

function showGraphInterface() {
    const graphContainer = document.getElementById('graph-container')
    const graphLegend = document.getElementById("graph-legend");
    const tabContainer = document.getElementById("tabs-container");
    const forceGraphElement = document.getElementById("graph");
    const emptyContent = document.getElementById("graph-container-empty-inside");
    const colorPickerContainer = document.getElementById("color-picker-container");

    graphContainer.classList.remove("graph-container-empty");
    emptyContent.classList.add("hidden");

    tabContainer.classList.remove("hidden");
    graphLegend.classList.remove("hidden");
    forceGraphElement.classList.remove("hidden");
    colorPickerContainer.classList.remove("hidden");

    scrollIntoView();
}

function resize(forceGraph){
    const { width, height } = canvasSize();
    forceGraph
        .height(height)
        .width(width);
}

export default function setUpUiManager(forceGraph){

    resize(forceGraph);
    window.addEventListener('resize', () => {
        resize(forceGraph);
    });

    eventBus.subscribe("graph:data-replaced", () => {
        showGraphInterface();
    });

}
