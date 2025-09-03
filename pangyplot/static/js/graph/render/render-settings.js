import {updateWidthMultiplier, updateTextSizeMultiplier} from './render-scaling.js';

export default function setUpRenderSettings(forceGraph) {
    const settings = [
        {
            id: "node-width-slider",
            onChange: (value) => {
                updateWidthMultiplier(value);
            }
        },
        {
            id: "font-size-slider",
            onChange: (value) => {
                updateTextSizeMultiplier(value);
            }
        },
    ];

    settings.forEach(({ id, onChange }) => {
        const slider = document.getElementById(id);
        if (!slider) {
            console.warn(`Slider with ID "${id}" not found.`);
            return;
        }

        slider.addEventListener("input", () => {
            onChange(parseFloat(slider.value));
        });
    });
}
