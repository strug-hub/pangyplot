import eventBus from "../../utils/event-bus.js";
import { canvasSize } from "./ui-canvas-size.js";

function scrollIntoView() {

    const graphContainer = document.getElementById('graph-container')
    const tabContainer = document.getElementById("tabs-container");

    graphContainer.classList.remove("graph-container-empty");
    graphContainer.scrollIntoView({ behavior: 'smooth' });
    tabContainer.classList.remove("hidden");
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
        scrollIntoView();
    });

}
