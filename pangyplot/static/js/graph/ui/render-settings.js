// UI controls for render settings.
// Populates the "Render Settings" section in the viewer
// and the Settings (gear) tab toggles.

import createSliderSet from '@ui/components/slider-set.js';
import { state } from '../state.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';

export function createToggle(label, initial, onChange) {
    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 4px; color: var(--font-color);
    `;

    const text = document.createElement('span');
    text.textContent = label;
    row.appendChild(text);

    const track = document.createElement('div');
    track.style.cssText = `
        width: 44px; height: 24px; border-radius: 12px; cursor: pointer;
        position: relative; transition: background 0.2s; flex-shrink: 0;
        background: ${initial ? '#e8b931' : '#555'};
    `;
    const thumb = document.createElement('div');
    thumb.style.cssText = `
        width: 20px; height: 20px; border-radius: 50%; background: #fff;
        position: absolute; top: 2px; transition: left 0.2s;
        left: ${initial ? '22px' : '2px'};
    `;
    track.appendChild(thumb);

    let on = initial;
    function setOn(val) {
        on = val;
        thumb.style.left = on ? '22px' : '2px';
        track.style.background = on ? '#e8b931' : '#555';
    }
    track.addEventListener('click', () => {
        setOn(!on);
        onChange(on);
    });

    row.appendChild(track);
    row.setOn = setOn;
    return row;
}

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

export function setupSettingsToggles() {
    const container = document.getElementById('settings-toggles');
    if (!container) return;
    container.innerHTML = '';

    const anchorToggle = createToggle('Anchor on Drag', state.fixOnDrag, (on) => {
        state.fixOnDrag = on;
    });
    anchorToggle.id = 'anchor-toggle-row';
    container.appendChild(anchorToggle);

    container.appendChild(createToggle('Always Show Skeleton', state.alwaysShowSkeleton, (on) => {
        state.alwaysShowSkeleton = on;
        scheduleFrame();
    }));

    // Expose for keyboard shortcut (F key)
    window.__anchorToggle = anchorToggle;
}
