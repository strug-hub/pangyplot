import { updateWidthMultiplier, updateTextSizeMultiplier } from '../render-scaling.js';
import createSliderSet from "../../../ui/utils/slider-set.js";

const settings = [
    {
        label: "Node Width", icon:"circle-plus", min: -1, max: 1, step: 0.1, default: 0,
        onChange: (value) => {
            updateWidthMultiplier(1 + value); // -1 to 1
        }
    },
    {
        id: "font-size-slider", icon:"text-width", label: "Font Size", min: -1, max: 1, step: 0.1, default: 0,
        onChange: (value) => {
            updateTextSizeMultiplier(1 + value); // -1 to 1
        }
    }
];

export default function setUpRenderSettings(forceGraph) {
    const sliderContainer = document.getElementById("render-settings-container");
    const sliderSet = createSliderSet("render", settings);
    sliderContainer.appendChild(sliderSet);
}
