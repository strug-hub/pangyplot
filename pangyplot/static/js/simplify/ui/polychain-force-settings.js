// UI sliders for polychain force tuning.
// Populates the "Force Settings" tab in the simplify viewer.

import createSliderSet from '../../ui/utils/slider-set.js';
import { pcSettings, applyPcSettings } from '../detail/engines/force-engine.js';

function sliderProperties() {
    return [
        {
            label: "PC Charge", icon: "atom",
            min: -200, max: 0, step: 1, default: pcSettings.charge,
            onChange: (v) => { pcSettings.charge = v; applyPcSettings(); }
        },
        {
            label: "PC Intra-Chain", icon: "up-down-left-right",
            min: 0, max: 2000, step: 10, default: pcSettings.intraChainRepulsion,
            onChange: (v) => { pcSettings.intraChainRepulsion = v; applyPcSettings(); }
        },
        {
            label: "PC Centroid Push", icon: "expand",
            min: 0, max: 50, step: 0.5, default: pcSettings.centroidRepulsion,
            onChange: (v) => { pcSettings.centroidRepulsion = v; applyPcSettings(); }
        },
        {
            label: "PC Loop Closure", icon: "circle",
            min: 0, max: 5, step: 0.1, default: pcSettings.loopClosure,
            onChange: (v) => { pcSettings.loopClosure = v; applyPcSettings(); }
        },
        {
            label: "PC Charge Distance", icon: "arrows-left-right-to-line",
            min: 10, max: 500, step: 10, default: pcSettings.chargeMaxDist,
            onChange: (v) => { pcSettings.chargeMaxDist = v; applyPcSettings(); }
        },
        {
            label: "PC Link Strength", icon: "link",
            min: 0, max: 5, step: 0.1, default: pcSettings.linkStrength,
            onChange: (v) => { pcSettings.linkStrength = v; applyPcSettings(); }
        },
        {
            label: "PC Link Min Rest", icon: "arrows-left-right",
            min: 0, max: 500, step: 5, default: pcSettings.linkMinRest,
            onChange: (v) => { pcSettings.linkMinRest = v; applyPcSettings(); }
        },
        {
            label: "PC Collision Radius", icon: "explosion",
            min: 0, max: 30, step: 1, default: pcSettings.collisionRadius,
            onChange: (v) => { pcSettings.collisionRadius = v; applyPcSettings(); }
        },
        {
            label: "PC Layout Pull", icon: "circle-nodes",
            min: 0, max: 0.001, step: 0.00001, default: pcSettings.layoutStrength,
            onChange: (v) => { pcSettings.layoutStrength = v; applyPcSettings(); }
        },
        {
            label: "PC Link Repulsion", icon: "maximize",
            min: 0, max: 5, step: 0.1, default: pcSettings.linkRepulsion,
            onChange: (v) => { pcSettings.linkRepulsion = v; applyPcSettings(); }
        },
        {
            label: "PC Repulsion Dist", icon: "ruler-horizontal",
            min: 10, max: 300, step: 5, default: pcSettings.linkRepulsionDist,
            onChange: (v) => { pcSettings.linkRepulsionDist = v; applyPcSettings(); }
        },
        {
            label: "PC Parent Side", icon: "arrow-right-from-bracket",
            min: 0, max: 10, step: 0.1, default: pcSettings.parentSide,
            onChange: (v) => { pcSettings.parentSide = v; applyPcSettings(); }
        },
    ];
}

export function setupPolychainForceSettings() {
    const container = document.getElementById('force-settings-container');
    if (!container) return;
    const sliderSet = createSliderSet('pc-force', sliderProperties());
    container.appendChild(sliderSet);
}
