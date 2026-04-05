// UI slider for render thickness scaling.
// Populates the "Render Settings" section in the simplify viewer.

import createSliderSet from '@ui/components/slider-set.js';
import { state } from '../simplify-state.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';

export function setupRenderSettings() {
    const container = document.getElementById('render-settings-container');
    if (!container) return;
    container.innerHTML = '';

    const sliders = createSliderSet('render', [
        {
            label: "Thickness", icon: "maximize",
            min: 0.1, max: 5, step: 0.1, default: state.thicknessMultiplier,
            onChange: (v) => { state.thicknessMultiplier = v; scheduleFrame(); }
        },
    ]);
    container.appendChild(sliders);
}
