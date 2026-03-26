// UI sliders for polychain force tuning.
// Populates the "Force Settings" tab in the simplify viewer.

import createSliderSet from '@ui/components/slider-set.js';
import { pcSettings, applyPcSettings } from '../detail/engines/force-engine.js';

function mainSliders() {
    return [
        {
            label: "Repulsion", icon: "atom",
            min: -200, max: 0, step: 1, default: pcSettings.charge,
            onChange: (v) => { pcSettings.charge = v; applyPcSettings(); }
        },
        {
            label: "Chain Inflation", icon: "up-down-left-right",
            min: 0, max: 5, step: 1, default: pcSettings.inflationLevel,
            onChange: (v) => { pcSettings.inflationLevel = v; applyPcSettings(); }
        },
        {
            label: "Loop Push", icon: "up-right-and-down-left-from-center",
            min: 0, max: 5, step: 1, default: pcSettings.centroidLevel,
            onChange: (v) => { pcSettings.centroidLevel = v; applyPcSettings(); }
        },
        {
            label: "Loop Pull", icon: "down-left-and-up-right-to-center",
            min: 0, max: 5, step: 1, default: pcSettings.loopLevel,
            onChange: (v) => { pcSettings.loopLevel = v; applyPcSettings(); }
        },
        {
            label: "Link Stiffness", icon: "link",
            min: 0.01, max: 1, step: 0.05, default: pcSettings.linkStrength,
            onChange: (v) => { pcSettings.linkStrength = v; applyPcSettings(); }
        },
        {
            label: "Layout Impulse", icon: "circle-nodes",
            min: 0, max: 5, step: 1, default: pcSettings.layoutLevel,
            onChange: (v) => { pcSettings.layoutLevel = v; applyPcSettings(); }
        },
        {
            label: "Edge Separation", icon: "maximize",
            min: 0, max: 5, step: 0.1, default: pcSettings.linkRepulsion,
            onChange: (v) => { pcSettings.linkRepulsion = v; applyPcSettings(); }
        },
        {
            label: "Smoothing", icon: "wand-magic-sparkles",
            min: 0, max: 0.03, step: 0.001, default: pcSettings.smoothing,
            onChange: (v) => { pcSettings.smoothing = v; applyPcSettings(); }
        },
        {
            label: "Inflate", icon: "expand",
            min: 0, max: 0.02, step: 0.001, default: pcSettings.inflate,
            onChange: (v) => { pcSettings.inflate = v; applyPcSettings(); }
        },
    ];
}

function advancedSliders() {
    return [
        {
            label: "Collision Radius", icon: "explosion",
            min: 0, max: 30, step: 1, default: pcSettings.collisionRadius,
            onChange: (v) => { pcSettings.collisionRadius = v; applyPcSettings(); }
        },
        {
            label: "Min Link Length", icon: "arrows-left-right",
            min: 0, max: 500, step: 5, default: pcSettings.linkMinRest,
            onChange: (v) => { pcSettings.linkMinRest = v; applyPcSettings(); }
        },
        {
            label: "Child Offset", icon: "arrow-right-from-bracket",
            min: 0, max: 10, step: 0.1, default: pcSettings.parentSide,
            onChange: (v) => { pcSettings.parentSide = v; applyPcSettings(); }
        },
    ];
}

export function setupPolychainForceSettings() {
    const container = document.getElementById('force-settings-container');
    if (!container) return;
    container.innerHTML = '';

    // Main sliders
    const mainSet = createSliderSet('pc-force', mainSliders());
    container.appendChild(mainSet);

    // Collapsible advanced section
    const details = document.createElement('details');
    details.className = 'advanced-settings';
    const summary = document.createElement('summary');
    summary.textContent = 'Advanced';
    details.appendChild(summary);

    const advSet = createSliderSet('pc-adv', advancedSliders());
    details.appendChild(advSet);
    container.appendChild(details);

    // Clear render settings (not used by simplify viewer)
    const renderContainer = document.getElementById('render-settings-container');
    if (renderContainer) renderContainer.innerHTML = '';
}
