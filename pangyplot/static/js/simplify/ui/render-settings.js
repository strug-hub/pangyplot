// UI controls for render settings.
// Populates the "Render Settings" section in the simplify viewer
// and the Settings (gear) tab toggles.

import createSliderSet from '@ui/components/slider-set.js';
import { state } from '../simplify-state.js';
import { scheduleFrame } from '../utils/frame-scheduler.js';

export function createToggle(label, initial, onChange) {
    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 2px; font-size: 12px; color: var(--unselected-text);
    `;

    const text = document.createElement('span');
    text.textContent = label;
    row.appendChild(text);

    const track = document.createElement('div');
    track.style.cssText = `
        width: 36px; height: 18px; border-radius: 9px; cursor: pointer;
        position: relative; transition: background 0.2s;
        background: ${initial ? 'var(--dark-green)' : '#555'};
    `;
    const thumb = document.createElement('div');
    thumb.style.cssText = `
        width: 14px; height: 14px; border-radius: 50%; background: #fff;
        position: absolute; top: 2px; transition: left 0.2s;
        left: ${initial ? '20px' : '2px'};
    `;
    track.appendChild(thumb);

    let on = initial;
    function setOn(val) {
        on = val;
        thumb.style.left = on ? '20px' : '2px';
        track.style.background = on ? 'var(--dark-green)' : '#555';
    }
    track.addEventListener('click', () => {
        setOn(!on);
        onChange(on);
    });

    row.appendChild(track);
    row.setOn = setOn;  // expose for external toggling (e.g. keyboard shortcut)
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
