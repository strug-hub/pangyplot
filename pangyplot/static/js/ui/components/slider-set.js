import { createSlider, resetSlider } from "@ui/elements/slider.js";
import { createButton } from "@ui/elements/button.js";

export default function createSliderSet(prefix, settings) {

    // Create a container for the sliders
    const container = document.createElement("div");
    container.id = `${prefix}-slider-set-container`;
    container.className = "slider-set-container flex-col";
    document.body.appendChild(container);

    settings.forEach(s => {
        const row = createSlider({
            label: s.label,
            icon: s.icon,
            min: s.min,
            max: s.max,
            step: s.step,
            defaultValue: s.default,
            onChange: s.onChange
        });
        container.appendChild(row);
    });

    // Create a reset-all button
    const resetAllBtn = createButton({
        text: "Reset All",
        icon: "undo",
        classList: ["slider-reset-all-button"],
        onClick: () => {
            settings.forEach(s => {
                const id = s.label.toLowerCase().replace(/ /g, "-");
                resetSlider(id, s.default);
                s.onChange(s.default);
            });
        }
    });
    container.appendChild(resetAllBtn);

    return container;
}
