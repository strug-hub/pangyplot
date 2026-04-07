// GFA export utilities for selected chains / viewport.

import { state } from '../../state.js';
import { getContainer } from '../../detail/model/model-manager.js';
import { BubbleObject } from '../../detail/model/bubble-object.js';

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

export async function downloadSelectedGfa() {
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
