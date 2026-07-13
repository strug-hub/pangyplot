// GFA export utilities for selected chains / viewport.

import { state } from '../../state.js';
import { t } from '@app-state';
import { showToast } from '@ui/elements/toast.js';
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

async function download(endpoint, { bubbleIds = [], segmentIds = [] } = {}, fallbackName, label) {
    if (bubbleIds.length === 0 && segmentIds.length === 0) return;

    // A whole-region export resolves every bubble down to its segments, which
    // takes real time -- say so rather than appearing to do nothing.
    const toast = showToast(t('Preparing {label}...').replace('{label}', label),
                            { type: 'loading' });

    let resp;
    try {
        resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                genome: state.GENOME,
                chromosome: state.chromosome,
                bubble_ids: bubbleIds,
                segment_ids: segmentIds,
            }),
        });
    } catch (err) {
        toast.update(t('Export failed'), { type: 'error' });
        return;
    }

    if (!resp.ok) {
        const detail = await resp.json().catch(() => null);
        toast.update(detail?.error || t('Export failed'), { type: 'error' });
        return;
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = resp.headers.get('Content-Disposition') || '';
    a.download = cd.match(/filename=(.+)/)?.[1] || fallbackName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.update(t('Downloaded {name}').replace('{name}', a.download), { type: 'success' });
}

function downloadGfa(ids) {
    return download('/gfa', ids, 'export.gfa', t('GFA'));
}

// The layout is only usable with the graph it belongs to, so /layout returns
// both, zipped, with segment IDs compacted the way odgi requires.
function downloadLayout(ids) {
    return download('/layout', ids, 'export.zip', t('GFA + layout'));
}

export async function downloadSelectedGfa() {
    downloadGfa(getSelectedNodeIds());
}

export async function downloadSelectedLayout() {
    downloadLayout(getSelectedNodeIds());
}

function getViewportNodeIds() {
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
    return { bubbleIds, segmentIds };
}

export async function exportViewportGfa() {
    if (!state.detailData) return;
    downloadGfa(getViewportNodeIds());
}

export async function exportViewportLayout() {
    if (!state.detailData) return;
    downloadLayout(getViewportNodeIds());
}
