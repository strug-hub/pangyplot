// Tooltip-style popup that appears after Shift+drag chain selection.
// Shows chain count, bp range, and a button to swap in the core graph viewer canvas.

import { state } from '../../simplify-state.js';
import { formatBp } from '../../utils/format-utils.js';

let popupEl = null;
let coreContainer = null;  // div that holds the core ForceGraph canvas
let coreViewer = null;     // the ForceGraph instance

function ensurePopup() {
    if (popupEl) return popupEl;
    popupEl = document.createElement('div');
    popupEl.id = 'selection-popup';
    popupEl.innerHTML = `
        <div class="sp-info"></div>
        <button class="sp-button">Open in Graph Viewer</button>
    `;
    popupEl.style.cssText = `
        position: fixed;
        display: none;
        z-index: 30;
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid #555;
        border-radius: 6px;
        padding: 8px 12px;
        font-family: 'SF Mono', Consolas, monospace;
        font-size: 11px;
        color: #ccc;
        white-space: nowrap;
        line-height: 1.6;
        pointer-events: auto;
    `;
    const btn = popupEl.querySelector('.sp-button');
    btn.style.cssText = `
        display: block;
        margin-top: 6px;
        padding: 4px 10px;
        background: #2a6dd9;
        color: #fff;
        border: none;
        border-radius: 4px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
        width: 100%;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = '#3a7de9'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#2a6dd9'; });
    btn.addEventListener('click', switchToCoreViewer);
    document.body.appendChild(popupEl);

    // Click outside → dismiss
    document.addEventListener('pointerdown', e => {
        if (popupEl.style.display !== 'none' && !popupEl.contains(e.target)) {
            hideSelectionPopup();
        }
    });

    return popupEl;
}

function getSelectionBpRange() {
    let minBp = Infinity, maxBp = -Infinity;
    for (const chain of state.selectedChains) {
        if (chain.bpStart != null) minBp = Math.min(minBp, chain.bpStart);
        if (chain.bpEnd != null) maxBp = Math.max(maxBp, chain.bpEnd);
    }
    if (!isFinite(minBp) || !isFinite(maxBp)) return null;
    return { bpStart: minBp, bpEnd: maxBp };
}

async function switchToCoreViewer() {
    const range = getSelectionBpRange();
    if (!range) return;

    hideSelectionPopup();

    const coords = {
        genome: state.GENOME,
        chromosome: state.chromosome,
        start: Math.round(range.bpStart),
        end: Math.round(range.bpEnd),
    };

    const container = document.getElementById('canvas-container');

    // Hide the simplify canvas
    state.canvas.style.display = 'none';

    // Create or reuse the core viewer container
    if (!coreContainer) {
        coreContainer = document.createElement('div');
        coreContainer.id = 'core-graph-target';
        coreContainer.style.cssText = 'width: 100%; height: 100%;';
        container.appendChild(coreContainer);
    } else {
        // Clear previous instance
        coreContainer.innerHTML = '';
    }
    coreContainer.style.display = 'block';

    // Dynamically import and initialize the core viewer
    const { initCoreViewer } = await import('../../../graph/force-graph.js');
    coreViewer = initCoreViewer(coreContainer, coords);

    state.coreViewerActive = true;
}

export function returnToSimplify() {
    if (!coreContainer) return;

    // Tear down the core viewer
    coreContainer.style.display = 'none';
    coreContainer.innerHTML = '';
    coreViewer = null;

    // Restore simplify canvas
    state.canvas.style.display = 'block';
    state.coreViewerActive = false;
}

export function isCoreViewerActive() {
    return !!state.coreViewerActive;
}

export function showSelectionPopup(screenX, screenY) {
    const range = getSelectionBpRange();
    if (!range) return;

    const el = ensurePopup();
    const count = state.selectedChains.size;
    const chr = state.chromosome || '';
    const info = el.querySelector('.sp-info');
    info.innerHTML =
        `<span style="color:#fff;font-weight:600">${count}</span> chain${count !== 1 ? 's' : ''}` +
        ` &middot; <span style="color:#5bb8f0">${chr}:${formatBp(range.bpStart)}\u2013${formatBp(range.bpEnd)}</span>`;

    el.style.display = 'block';

    // Position near the selection endpoint, clamped to viewport
    const rect = el.getBoundingClientRect();
    let tx = screenX + 12;
    let ty = screenY - rect.height - 10;
    if (tx + rect.width > window.innerWidth - 8) tx = screenX - rect.width - 12;
    if (ty < 4) ty = screenY + 16;
    el.style.left = tx + 'px';
    el.style.top = ty + 'px';
}

export function hideSelectionPopup() {
    if (popupEl) popupEl.style.display = 'none';
}
