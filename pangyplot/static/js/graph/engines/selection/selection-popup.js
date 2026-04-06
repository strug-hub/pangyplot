// Tooltip-style popup that appears after Shift+drag chain selection.
// Shows chain count, bp range, and a button to export GFA.

import { state } from '../../state.js';
import { formatBp } from '@format-utils';
import { getContainer } from '../../detail/model/model-manager.js';
import { BubbleObject } from '../../detail/model/bubble-object.js';

let popupEl = null;

function ensurePopup() {
    if (popupEl) return popupEl;
    popupEl = document.createElement('div');
    popupEl.id = 'selection-popup';
    popupEl.innerHTML = `
        <div class="sp-info"></div>
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

    const gfaBtn = popupEl.querySelector('.sp-gfa-button');
    gfaBtn.style.cssText = `
        display: block;
        margin-top: 6px;
        padding: 4px 10px;
        background: #2a8d47;
        color: #fff;
        border: none;
        border-radius: 4px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
        width: 100%;
    `;
    gfaBtn.addEventListener('mouseenter', () => { gfaBtn.style.background = '#3a9d57'; });
    gfaBtn.addEventListener('mouseleave', () => { gfaBtn.style.background = '#2a8d47'; });
    gfaBtn.addEventListener('click', exportGfa);

    document.body.appendChild(popupEl);

    // Left-click outside → dismiss (preserve popup on right-click for context menu)
    document.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (popupEl.style.display !== 'none' && !popupEl.contains(e.target)) {
            hideSelectionPopup();
        }
    });

    return popupEl;
}

function getSelectedNodeIds() {
    const bubbleIds = [];
    const segmentIds = [];

    // Chains: get unpopped bubbles in clip range from container
    for (const [chain, clip] of state.selectedChains) {
        const container = getContainer(chain.id);
        if (!container) continue;
        const inRange = container.bubblesInRange(clip.tStart, clip.tEnd);
        for (const b of inRange) {
            const raw = Number(String(b.id).replace(/^b/, ''));
            bubbleIds.push(raw);
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
    if (range) lines.push(row('range', rangeText, '#5bb8f0'));
    if (totalSize > 0) lines.push(row('total size', formatBp(totalSize, { unit: true })));
    info.innerHTML = lines.join('<br>');

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
