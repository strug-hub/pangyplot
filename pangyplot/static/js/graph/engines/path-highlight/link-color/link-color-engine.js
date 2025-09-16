import { fetchData, buildUrl } from '../../../../utils/network-utils.js';
import { colorState } from '../../../render/color/color-state.js'
import eventBus from "../../../../utils/event-bus.js";

var selectedSampleIdx = -1

async function fetchPathData(forceGraph) {
    const url = buildUrl('/pathorder', forceGraph.coords);
    return await fetchData(url, "path-order");
}


export default async function setupLinkColorEngine(forceGraph) {

    const pathSelector = document.getElementById('path-selector');

    const pathSelectButton = document.getElementById('path-select-button');
    pathSelectButton.addEventListener('click', async function () {
        const pathOrderData = await fetchPathData(forceGraph);

        if (!pathOrderData) {
            selectedSampleIdx = -1;
            return;
        }
        const selectedSample = pathSelector.value;
        selectedSampleIdx = pathOrderData[selectedSample];

        for (const link of forceGraph.graphData().links) {
            if (link.record && typeof link.record.hasSample === "function") {
                if (link.record.hasSample(selectedSampleIdx)) {
                    link.colorOverride = colorState.selectedColor;
                    console.log(link.colorOverride);
                }else{
                    link.colorOverride = undefined;
                }
            }
        }
    });

    const pathClearButton = document.getElementById('path-clear-button');
    pathClearButton.addEventListener('click', function () {
        for (const link of forceGraph.graphData().links) {
            selectedSampleIdx = -1;

            link.colorOverride = undefined;
        }
    });

    eventBus.subscribe('graph:bubble-popped', ({ id: bubbleId, graphData }) => {
        if (selectedSampleIdx >= 0) {
            for (const link of graphData.links) {
                console.log("newlink:", link);
                if (link.record && typeof link.record.hasSample === "function") {

                    if (link.record.hasSample(selectedSampleIdx))
                        link.colorOverride = colorState.selectedColor;
                }
            }
        } else {
            for (const link of graphData.links) {
                link.colorOverride = undefined;
            }
        }
    });

}
