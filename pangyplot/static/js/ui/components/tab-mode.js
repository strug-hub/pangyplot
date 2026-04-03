// Tab visibility by canvas mode.
// Core-only tabs are hidden when the simplify viewer is active.

import { getCanvasMode } from '@app-state';
import eventBus from '@event-bus';
import { switchTab } from './tab-set.js';

const CORE_ONLY_TABS = [
    'path-selector',
    'tool-tab',
];

function applyTabVisibility() {
    const mode = getCanvasMode();
    const isSimplify = mode === 'simplify';

    for (const tabId of CORE_ONLY_TABS) {
        const btn = document.getElementById(tabId + '-button');
        const content = document.getElementById(tabId + '-content');
        if (btn) btn.classList.toggle('hidden', isSimplify);
        if (content && isSimplify) content.classList.add('hidden');
    }

    // If the active tab got hidden, switch to first visible tab
    if (isSimplify) {
        const activeBtn = document.querySelector('.tab-button.active-tab-button');
        if (activeBtn && activeBtn.classList.contains('hidden')) {
            switchTab('keyboard-shortcuts');
        }
    }

    // Toggle keyboard shortcuts panels
    const coreKb = document.getElementById('keyboard-shortcuts-core');
    const simplifyKb = document.getElementById('keyboard-shortcuts-simplify');
    if (coreKb) coreKb.classList.toggle('hidden', isSimplify);
    if (simplifyKb) simplifyKb.classList.toggle('hidden', !isSimplify);
}

window.addEventListener('DOMContentLoaded', applyTabVisibility);
eventBus.subscribe('app:canvas-mode-changed', applyTabVisibility);
