// UI sliders for polychain force tuning.
// Populates the "Force Settings" tab in the simplify viewer.

import createSliderSet from '@ui/components/slider-set.js';
import { resetSlider } from '@ui/elements/slider.js';
import { pcSettings, applyPcSettings, pauseSim, resumeSim, isSimulating } from '../detail/engines/force-engine.js';
import { isDebugMode } from '@app-state';
import eventBus from '@event-bus';
import { setupRenderSettings, setupSettingsToggles } from './render-settings.js';

function mainSliders() {
    return [
        {
            label: "Layout Impulse", icon: "circle-nodes",
            min: 0, max: 5, step: 1, default: pcSettings.layoutLevel,
            onChange: (v) => { pcSettings.layoutLevel = v; applyPcSettings(); }
        },
        {
            label: "Node Repulsion", icon: "atom",
            min: -500, max: 0, step: 1, default: pcSettings.charge,
            onChange: (v) => { pcSettings.charge = v; applyPcSettings(); }
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
        {
            label: "Scale Factor", icon: "ruler",
            min: 0.1, max: 5, step: 0.01, default: pcSettings.dataScale,
            onChange: (v) => { pcSettings.dataScale = v; applyPcSettings(); }
        },
    ];
}

function advancedSliders() {
    return [
        {
            label: "Centroid Repulsion", icon: "up-right-and-down-left-from-center",
            min: 0, max: 5, step: 1, default: pcSettings.centroidLevel,
            onChange: (v) => { pcSettings.centroidLevel = v; applyPcSettings(); }
        },
        {
            label: "Loop Pull", icon: "down-left-and-up-right-to-center",
            min: 0, max: 5, step: 1, default: pcSettings.loopLevel,
            onChange: (v) => { pcSettings.loopLevel = v; applyPcSettings(); }
        },
        {
            label: "Link Strength", icon: "link",
            min: 1, max: 5, step: 1, default: pcSettings.linkStrengthLevel,
            onChange: (v) => { pcSettings.linkStrengthLevel = v; applyPcSettings(); }
        },
        {
            label: "Collision Radius", icon: "explosion",
            min: 0, max: 30, step: 1, default: pcSettings.collisionRadius,
            onChange: (v) => { pcSettings.collisionRadius = v; applyPcSettings(); }
        },
        {
            label: "Child Offset", icon: "arrow-right-from-bracket",
            min: 0, max: 10, step: 0.1, default: pcSettings.parentSide,
            onChange: (v) => { pcSettings.parentSide = v; applyPcSettings(); }
        },
        {
            label: "Guide Strength", icon: "compress",
            min: 0, max: 0.1, step: 0.005, default: pcSettings.guideLevel,
            onChange: (v) => { pcSettings.guideLevel = v; applyPcSettings(); }
        },
        {
            label: "Deletion Push", icon: "arrows-left-right",
            min: 0, max: 10, step: 0.1, default: pcSettings.delLinkStrength,
            onChange: (v) => { pcSettings.delLinkStrength = v; applyPcSettings(); }
        },
    ];
}

let advancedEl = null;

function rebuildAdvanced(container) {
    if (advancedEl) {
        advancedEl.remove();
        advancedEl = null;
    }
    if (!isDebugMode()) return;

    const details = document.createElement('details');
    details.className = 'advanced-settings';
    const summary = document.createElement('summary');
    summary.textContent = 'Advanced';
    details.appendChild(summary);
    details.appendChild(createSliderSet('pc-adv', advancedSliders()));
    container.appendChild(details);
    advancedEl = details;
}

export function setupPolychainForceSettings() {
    const container = document.getElementById('force-settings-container');
    if (!container) return;
    container.innerHTML = '';

    // Stop/resume button
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop Forces';
    stopBtn.style.cssText = `
        width: 100%; padding: 6px; margin-bottom: 8px; border: 1px solid var(--dark-green);
        border-radius: 4px; cursor: pointer; font-size: 12px;
        background: var(--tab-box); color: var(--unselected-text);
    `;
    let stopped = false;
    stopBtn.addEventListener('click', () => {
        if (stopped) {
            resumeSim();
            stopBtn.textContent = 'Stop Forces';
        } else {
            pauseSim();
            stopBtn.textContent = 'Resume Forces';
        }
        stopped = !stopped;
    });
    container.appendChild(stopBtn);

    // Main sliders
    container.appendChild(createSliderSet('pc-force', mainSliders()));

    // Advanced section (debug mode only)
    rebuildAdvanced(container);
    eventBus.subscribe('app:debug-mode-changed', () => rebuildAdvanced(container));

    // Render settings (thickness scaling)
    setupRenderSettings();
    setupSettingsToggles();
}

/** Update the scale factor slider to reflect the current pcSettings.dataScale. */
export function syncScaleSlider() {
    resetSlider('scale-factor', pcSettings.dataScale);
}
