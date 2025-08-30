const renderSettings = {
    widthAdjustment: 0,
    textSizeAdjustment: 0
};

export function getWidthAdjustment() {
    return renderSettings.widthAdjustment;
}

export function getTextSizeAdjustment() {
    return renderSettings.textSizeAdjustment;
}

export default function setUpRenderSettings(forceGraph) {
    const settings = [
        {
            id: "node-width-slider",
            onChange: (value) => {
                renderSettings.widthAdjustment = value;
            }
        },
        {
            id: "font-size-slider",
            onChange: (value) => {
                renderSettings.textSizeAdjustment = value;
            }
        },
    ];

    // Attach listeners dynamically
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
