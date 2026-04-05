// Tooltip-style popup that appears after Shift+drag chain selection.
// Shows chain count, bp range, and a button to swap in the core graph viewer canvas.

import { state } from '../../simplify-state.js';
import { setCanvasMode } from '@app-state';
import { formatBp } from '@format-utils';
import { setupPolychainForceSettings } from '../../ui/polychain-force-settings.js';
import { getContainer } from '../../detail/model/model-manager.js';
import { BubbleObject } from '../../detail/model/bubble-object.js';

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
        <button class="sp-button sp-gfa-button">Export GFA</button>
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

    const gfaBtn = popupEl.querySelector('.sp-gfa-button');
    gfaBtn.style.cssText = btn.style.cssText;
    gfaBtn.style.background = '#2a8d47';
    gfaBtn.style.marginTop = '4px';
    gfaBtn.addEventListener('mouseenter', () => { gfaBtn.style.background = '#3a9d57'; });
    gfaBtn.addEventListener('mouseleave', () => { gfaBtn.style.background = '#2a8d47'; });
    gfaBtn.addEventListener('click', exportGfa);

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

function getSelectedNodeIds() {
    const bubbleIds = [];
    const segmentIds = [];

    // Chains: get unpopped bubbles in clip range from container
    for (const [chain, clip] of state.selectedChains) {
        const container = getContainer(chain.id);
        if (!container) continue;
        for (const b of container.bubblesInRange(clip.tStart, clip.tEnd)) {
            bubbleIds.push(Number(String(b.id).replace(/^b/, '')));
        }
    }

    // Junction SimObjects
    for (const obj of state.selectedObjects) {
        if (obj instanceof BubbleObject) {
            bubbleIds.push(Number(String(obj.id).replace(/^b/, '')));
        } else if (obj.id && String(obj.id).startsWith('s')) {
            segmentIds.push(Number(String(obj.id).replace(/^s/, '')));
        }
    }

    return { bubbleIds, segmentIds };
}

async function downloadGfa({ bubbleIds = [], segmentIds = [] } = {}) {
    if (bubbleIds.length === 0 && segmentIds.length === 0) return;

    const resp = await fetch('/gfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            genome: state.GENOME,
            chromosome: state.chromosome,
            bubble_ids: bubbleIds,
            segment_ids: segmentIds,
        }),
    });
    if (!resp.ok) return;

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = resp.headers.get('Content-Disposition') || '';
    a.download = cd.match(/filename=(.+)/)?.[1] || 'export.gfa';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function exportGfa() {
    hideSelectionPopup();
    downloadGfa(getSelectedNodeIds());
}

export async function exportViewportGfa() {
    if (!state.detailData) return;
    const bubbleIds = [];
    for (const chain of state.detailData.chains) {
        const container = getContainer(chain.id);
        if (!container) continue;
        for (const b of container.bubblesInRange(0, 1)) {
            bubbleIds.push(Number(String(b.id).replace(/^b/, '')));
        }
    }
    const segmentIds = [];
    for (const obj of state.selectedObjects) {
        if (obj instanceof BubbleObject) {
            bubbleIds.push(Number(String(obj.id).replace(/^b/, '')));
        } else if (obj.id && String(obj.id).startsWith('s')) {
            segmentIds.push(Number(String(obj.id).replace(/^s/, '')));
        }
    }
    downloadGfa({ bubbleIds, segmentIds });
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

export async function returnToSimplify() {
    if (!coreContainer) return;

    // Tear down the core viewer: stop animation, remove global listeners, clear data
    // force-graph.js is already loaded from switchToCoreViewer's dynamic import
    const { destroyCoreViewer } = await import('../../../graph/force-graph.js');
    destroyCoreViewer(coreViewer);
    coreContainer.style.display = 'none';
    coreContainer.innerHTML = '';
    coreViewer = null;

    // Restore simplify canvas, status bars, and toolbar sliders
    state.canvas.style.display = 'block';
    state.coreViewerActive = false;
    setCanvasMode('simplify');
    setupPolychainForceSettings();

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
    if (!range && state.selectedObjects.size === 0) return;

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
    if (count > 0) lines.push(row('chains', count));
    if (state.selectedObjects.size > 0) lines.push(row('junctions', state.selectedObjects.size));
    if (range) lines.push(`<span class="sp-range-link" style="cursor:pointer">${row('range', rangeText, '#5bb8f0')}</span>`);
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
