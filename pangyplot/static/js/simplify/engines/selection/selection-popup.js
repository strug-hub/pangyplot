// Tooltip-style popup that appears after Shift+drag chain selection.
// Shows chain count, bp range, and a button to swap in the core graph viewer canvas.

import { state } from '../../simplify-state.js';
import { setCanvasMode } from '@app-state';
import { formatBp } from '@format-utils';

let popupEl = null;
let coreContainer = null;  // div that holds the core ForceGraph canvas
let coreViewer = null;     // the ForceGraph instance
let backBtn = null;        // "Back to Simplify" button shown during core viewer

function ensurePopup() {
    if (popupEl) return popupEl;
    popupEl = document.createElement('div');
    popupEl.id = 'selection-popup';
    popupEl.innerHTML = `
        <div class="sp-info"></div>
        <button class="sp-button">Open Bubble View</button>
    `;
    popupEl.style.cssText = `
        position: fixed;
        display: none;
        z-index: 30;
        background: rgba(20, 20, 20, 0.92);
        border: 1px solid #444;
        border-radius: 4px;
        padding: 6px 10px;
        font-family: 'SF Mono', Consolas, monospace;
        font-size: 11px;
        color: #ccc;
        white-space: nowrap;
        line-height: 1.5;
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

function ensureBackButton() {
    if (backBtn) return backBtn;
    backBtn = document.createElement('button');
    backBtn.id = 'back-to-simplify';
    backBtn.textContent = '\u25C0 Full Chain View';
    backBtn.style.cssText = `
        position: absolute;
        left: 50%;
        top: 8px;
        transform: translateX(-50%);
        z-index: 30;
        display: none;
        padding: 6px 14px;
        background: rgba(20, 20, 20, 0.82);
        color: #ccc;
        border: 1px solid #444;
        border-radius: 4px;
        font-family: 'SF Mono', Consolas, monospace;
        font-size: 11px;
        cursor: pointer;
    `;
    backBtn.addEventListener('mouseenter', () => {
        backBtn.style.background = 'rgba(42, 109, 217, 0.85)';
        backBtn.style.color = '#fff';
    });
    backBtn.addEventListener('mouseleave', () => {
        backBtn.style.background = 'rgba(20, 20, 20, 0.82)';
        backBtn.style.color = '#ccc';
    });
    backBtn.addEventListener('click', returnToSimplify);
    const container = document.getElementById('canvas-container');
    container.appendChild(backBtn);
    return backBtn;
}

function getSelectionBpRange() {
    let minBp = Infinity, maxBp = -Infinity;
    for (const [chain, clip] of state.selectedChains) {
        if (chain.bpStart == null || chain.bpEnd == null) continue;
        const chainBpSpan = chain.bpEnd - chain.bpStart;
        if (chainBpSpan <= 0) continue;

        const reversed = chain.bpHead != null && chain.bpTail != null &&
            chain.bpHead > chain.bpTail;

        let bp0, bp1;
        if (reversed) {
            bp0 = chain.bpStart + (1 - clip.tEnd) * chainBpSpan;
            bp1 = chain.bpStart + (1 - clip.tStart) * chainBpSpan;
        } else {
            bp0 = chain.bpStart + clip.tStart * chainBpSpan;
            bp1 = chain.bpStart + clip.tEnd * chainBpSpan;
        }
        if (bp0 < minBp) minBp = bp0;
        if (bp1 > maxBp) maxBp = bp1;
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
    setCanvasMode('core');

    // Hide simplify status bars so they don't push down the core canvas
    const controls = document.getElementById('simplify-controls');
    const detailBar = document.getElementById('detail-bar');
    if (controls) controls.style.display = 'none';
    if (detailBar) detailBar.style.display = 'none';

    ensureBackButton().style.display = 'block';
}

export function returnToSimplify() {
    if (!coreContainer) return;

    // Tear down the core viewer
    coreContainer.style.display = 'none';
    coreContainer.innerHTML = '';
    coreViewer = null;

    // Restore simplify canvas and status bars
    state.canvas.style.display = 'block';
    state.coreViewerActive = false;
    setCanvasMode('simplify');

    const controls = document.getElementById('simplify-controls');
    const detailBar = document.getElementById('detail-bar');
    if (controls) controls.style.display = '';
    if (detailBar) detailBar.style.display = '';

    if (backBtn) backBtn.style.display = 'none';
}

export function isCoreViewerActive() {
    return !!state.coreViewerActive;
}

function row(label, value, color) {
    const style = color ? ` style="color:${color}"` : '';
    return `<span class="tt-label">${label}</span> <span class="tt-val"${style}>${value}</span>`;
}

export function showSelectionPopup(screenX, screenY) {
    const range = getSelectionBpRange();
    if (!range) return;

    const el = ensurePopup();
    const count = state.selectedChains.size;
    const chr = state.chromosome || '';
    const info = el.querySelector('.sp-info');

    let totalSize = 0;
    for (const chain of state.selectedChains.keys()) {
        if (chain.length) totalSize += chain.length;
    }

    const rangeText = `${chr}:${formatBp(range.bpStart)}\u2013${formatBp(range.bpEnd)}`;
    const lines = [];
    lines.push(row('chains', count));
    lines.push(`<span class="sp-range-link" style="cursor:pointer">${row('range', rangeText, '#5bb8f0')}</span>`);
    if (totalSize > 0) lines.push(row('total size', formatBp(totalSize, { unit: true })));
    info.innerHTML = lines.join('<br>');

    // Make range row clickable
    const rangeLink = info.querySelector('.sp-range-link');
    if (rangeLink) {
        rangeLink.addEventListener('mouseenter', () => {
            rangeLink.style.textDecoration = 'underline';
            rangeLink.style.textDecorationColor = '#5bb8f0';
        });
        rangeLink.addEventListener('mouseleave', () => {
            rangeLink.style.textDecoration = 'none';
        });
        rangeLink.addEventListener('click', switchToCoreViewer);
    }

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
