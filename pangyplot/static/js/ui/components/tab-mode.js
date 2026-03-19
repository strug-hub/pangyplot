// Tab visibility by canvas mode.
// Core-only tabs are hidden when the simplify viewer is active.

import { getCanvasMode } from '@app-state';
import eventBus from '@event-bus';
import { switchTab } from './tab-set.js';

const CORE_ONLY_TABS = [
    'graph-info',
    'path-selector',
    'search-tab',
    'tool-tab',
];

function applyTabVisibility() {
    const mode = getCanvasMode();
    for (const tabId of CORE_ONLY_TABS) {
        const btn = document.getElementById(tabId + '-button');
        const content = document.getElementById(tabId + '-content');
        if (btn) btn.classList.toggle('hidden', mode === 'simplify');
        if (content && mode === 'simplify') content.classList.add('hidden');
    }

    // If the active tab got hidden, switch to first visible tab
    if (mode === 'simplify') {
        const activeBtn = document.querySelector('.tab-button.active-tab-button');
        if (activeBtn && activeBtn.classList.contains('hidden')) {
            switchTab('keyboard-shortcuts');
        }
    }
}

window.addEventListener('DOMContentLoaded', applyTabVisibility);
eventBus.subscribe('app:canvas-mode-changed', applyTabVisibility);
