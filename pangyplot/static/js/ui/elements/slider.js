/**
 * Create a single slider row with label, range input, value display, and reset button.
 *
 * @param {Object} opts
 * @param {string}   opts.label        - Display label
 * @param {string}   opts.icon         - FontAwesome icon name
 * @param {number}   opts.min          - Range minimum
 * @param {number}   opts.max          - Range maximum
 * @param {number}   opts.step         - Range step
 * @param {number}   opts.defaultValue - Default/reset value
 * @param {Function} opts.onChange      - Called with numeric value on input
 * @returns {HTMLDivElement}
 */
export function createSlider({ label, icon, min, max, step, defaultValue, onChange }) {
    const id = label.toLowerCase().replace(/ /g, "-");
    const row = document.createElement("div");

    row.className = "slider-style flex-1 flex-row";
    row.innerHTML = `
        <div class="flex-col" style="width:100%">
            <div class="flex-row">
                <span class="flex-row">
                    <i class="fa-solid fa-${icon}"></i>
                    <label class="slider-label flex-4" for="${id}">${label}</label>
                </span>
                <span id="${id}-value" class="slider-value flex-1">${defaultValue}</span>
                <button class="slider-reset-button flex-1">
                    <i class="fas fa-undo"></i>
                </button>
            </div>

            <input type="range" id="${id}" name="${id}" class="flex-1"
                min="${min}" max="${max}" step="${step}" value="${defaultValue}">
        </div>
    `;

    const slider = row.querySelector(`#${id}`);
    const output = row.querySelector(`#${id}-value`);
    const resetButton = row.querySelector("button");
    resetButton.classList.add("slider-reset-default");

    function updateResetButtonColor() {
        if (parseFloat(slider.value) === defaultValue) {
            resetButton.classList.remove("slider-reset-modified");
            resetButton.classList.add("slider-reset-default");
        } else {
            resetButton.classList.remove("slider-reset-default");
            resetButton.classList.add("slider-reset-modified");
        }
    }

    slider.addEventListener("input", () => {
        output.textContent = slider.value;
        onChange(parseFloat(slider.value));
        updateResetButtonColor();
    });

    resetButton.addEventListener("click", () => {
        slider.value = defaultValue;
        output.textContent = defaultValue;
        onChange(parseFloat(slider.value));
        updateResetButtonColor();
    });

    return row;
}

/**
 * Reset a slider to its default value by element ID.
 *
 * @param {string} sliderId     - The slider input element ID
 * @param {number} defaultValue - The value to reset to
 */
export function resetSlider(sliderId, defaultValue) {
    const slider = document.getElementById(sliderId);
    const output = document.getElementById(`${sliderId}-value`);
    const resetButton = slider.parentElement.querySelector("button");

    slider.value = defaultValue;
    output.textContent = defaultValue;

    if (parseFloat(slider.value) === defaultValue) {
        resetButton.classList.remove("slider-reset-modified");
        resetButton.classList.add("slider-reset-default");
    } else {
        resetButton.classList.remove("slider-reset-default");
        resetButton.classList.add("slider-reset-modified");
    }
}
