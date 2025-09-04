document.addEventListener("DOMContentLoaded", function () {
    const settings = [
        //{ id: "alpha-slider", label: "Alpha", min: 0, max: 1, step: 0.0001, value: 0.0228, default: 0.0228 },
        //{ id: "friction-slider", label: "Friction", min: 0.05, max: 1.0, step: 0.01, value: 0.4, default: 0.1 },
        { id: "attraction-slider", label: "Attraction", min: -1000, max: 1000, step: 1, value: -500, default: -500 },
        { id: "collision-slider", label: "Collision", min: 0, max: 200, step: 1, value: 50, default: 50 },
        { id: "pull-slider", label: "Pull", min: 0, max: 200, step: 1, value: 100, default: 100 },
        { id: "node-width-slider", label: "Node Width", min: -1, max: 1, step: 0.1, value: 0, default: 0 },
        { id: "font-size-slider", label: "Font Size", min: -1, max: 1, step: 0.1, value: 0, default: 0 }

    ];

    const container = document.getElementById("graph-settings");
    const resetAllBtn = document.getElementById("reset-all-button");

    // --- Build slider rows dynamically ---
    settings.forEach(s => {
        const row = document.createElement("div");
        row.className = "graph-setting flex-1 flex-row";
        row.innerHTML = `
            <label class="graph-setting-label flex-1" for="${s.id}">${s.label}: </label>
            <input type="range" id="${s.id}" name="${s.id}" class="flex-1"
                min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}">
            <span id="${s.id}-value" class="graph-setting-value flex-1">${s.value}</span>
            <button class="graph-setting-reset-button">
                <i class="fas fa-undo"></i>
            </button>
        `;
        container.insertBefore(row, resetAllBtn);

        const slider = row.querySelector(`#${s.id}`);
        const output = row.querySelector(`#${s.id}-value`);
        const resetButton = row.querySelector("button");

        // init reset button state
        updateResetButtonColor(slider, s.default, resetButton);

        // live update
        slider.addEventListener("input", () => {
            output.textContent = slider.value;
            updateResetButtonColor(slider, s.default, resetButton);
        });

        // reset one slider
        resetButton.addEventListener("click", () => {
            resetSlider(s.id, s.default);
        });
    });

    // --- Reset logic ---
    window.resetSlider = function (sliderId, defaultValue) {
        const slider = document.getElementById(sliderId);
        const output = document.getElementById(`${sliderId}-value`);
        const resetButton = slider.parentElement.querySelector("button");

        slider.value = defaultValue;
        output.textContent = defaultValue;
        updateResetButtonColor(slider, defaultValue, resetButton);
    };

    function updateResetButtonColor(slider, defaultValue, resetButton) {
        if (parseFloat(slider.value) === defaultValue) {
            resetButton.classList.remove("reset-button-modified");
            resetButton.classList.add("reset-button-default");
        } else {
            resetButton.classList.remove("reset-button-default");
            resetButton.classList.add("reset-button-modified");
        }
    }

    // Reset all sliders
    resetAllBtn.addEventListener("click", () => {
        settings.forEach(s => resetSlider(s.id, s.default));
    });
});
