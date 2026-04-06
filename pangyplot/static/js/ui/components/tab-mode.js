// Tab visibility by canvas mode.

import { getCanvasMode } from '@app-state';
import eventBus from '@event-bus';
import { switchTab } from './tab-set.js';

function applyTabVisibility() {
    const mode = getCanvasMode();
    const isSimplify = mode === 'simplify';

    // If the active tab got hidden, switch to first visible tab
    if (isSimplify) {
        const activeBtn = document.querySelector('.tab-button.active-tab-button');
        if (activeBtn && activeBtn.classList.contains('hidden')) {
            switchTab('keyboard-shortcuts');
        }
    }

    // Hide core-only settings within shared tabs
    for (const el of document.querySelectorAll('.core-only-setting')) {
        el.classList.toggle('hidden', isSimplify);
    }

    // Toggle keyboard shortcuts panels
    const coreKb = document.getElementById('keyboard-shortcuts-core');
    const simplifyKb = document.getElementById('keyboard-shortcuts-simplify');
    if (coreKb) coreKb.classList.toggle('hidden', isSimplify);
    if (simplifyKb) simplifyKb.classList.toggle('hidden', !isSimplify);
}

window.addEventListener('DOMContentLoaded', applyTabVisibility);
eventBus.subscribe('app:canvas-mode-changed', applyTabVisibility);
