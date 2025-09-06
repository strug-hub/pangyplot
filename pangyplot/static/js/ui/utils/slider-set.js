export default function createSliderSet(prefix, settings) {

    // Create a container for the sliders
    const container = document.createElement("div");
    container.id = `${prefix}-slider-set-container`;
    container.className = "slider-set-container flex-col";
    document.body.appendChild(container);

    settings.forEach(s => {
        const row = createSlider(s);
        container.appendChild(row);
    });

    // Create a reset button
    const resetAllBtn = document.createElement("button");
    resetAllBtn.id = `${prefix}-reset-all-button`;
    resetAllBtn.classList.add("button-style");
    resetAllBtn.classList.add("slider-reset-all-button");

    resetAllBtn.innerHTML = `<i class="fas fa-undo"></i> Reset All`;
    container.appendChild(resetAllBtn);

    // Reset all sliders
    resetAllBtn.addEventListener("click", () => {
        settings.forEach(s => {
            const id = s.label.toLowerCase().replace(/ /g, "-");
            resetSlider(id, s.default);
        });
    });

    return container;
}

function createSlider(s) {
    const row = document.createElement("div");
    const id = s.label.toLowerCase().replace(/ /g, "-");

    row.className = "slider-style flex-1 flex-row";
    row.innerHTML = `
        <div class="flex-col" style="width:100%">
            <div class="flex-row">
                <span class="flex-row">
                    <i class="fa-solid fa-${s.icon}"></i>
                    <label class="slider-label flex-4" for="${id}">${s.label}</label>
                </span>
                <span id="${id}-value" class="slider-value flex-1">${s.default}</span>
                <button class="slider-reset-button flex-1">
                    <i class="fas fa-undo"></i>
                </button>
            </div>

            <input type="range" id="${id}" name="${id}" class="flex-1"
                min="${s.min}" max="${s.max}" step="${s.step}" value="${s.default}">
        </div>
    `;

    const slider = row.querySelector(`#${id}`);
    const output = row.querySelector(`#${id}-value`);
    const resetButton = row.querySelector("button");
    resetButton.classList.add("slider-reset-default");

    // live update
    slider.addEventListener("input", () => {
        output.textContent = slider.value;
        s.onChange(parseFloat(slider.value));
        updateResetButtonColor(slider, s.default, resetButton);
    });

    // reset slider
    resetButton.addEventListener("click", () => {
        resetSlider(id, s.default);
        s.onChange(parseFloat(slider.value));
        updateResetButtonColor(slider, s.default, resetButton);

    });

    return row;
}

function updateResetButtonColor(slider, defaultValue, resetButton) {
    if (parseFloat(slider.value) === defaultValue) {
        resetButton.classList.remove("slider-reset-modified");
        resetButton.classList.add("slider-reset-default");
    } else {
        resetButton.classList.remove("slider-reset-default");
        resetButton.classList.add("slider-reset-modified");
    }
}

function resetSlider(sliderId, defaultValue) {
    const slider = document.getElementById(sliderId);
    const output = document.getElementById(`${sliderId}-value`);
    const resetButton = slider.parentElement.querySelector("button");

    slider.value = defaultValue;
    updateResetButtonColor(slider, defaultValue, resetButton);
    output.textContent = defaultValue;
};
