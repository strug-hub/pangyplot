// Centralized UI status bar updates. All DOM writes to the info bar and detail
// bar flow through here. Other modules update simplify-state.js; the render
// loop (or event handlers) call these functions to flush state to the DOM.

import { state } from '../simplify-state.js';
import { formatBp } from '../utils/format-utils.js';
import { xToBp } from '../engines/reference-spine-engine.js';
import { viewportStepCount } from '../render/viewport.js';
import { getLevelCount, getLevelMeta } from '../data/chromosome-data.js';
import { positionTooltip } from '@ui/elements/tooltip.js';

// ---------------------------------------------------------------
// One-time init
// ---------------------------------------------------------------

/** Show loading error and abort. */
export function showLoadingError(msg) {
    state.dom.loading.textContent = `Error loading data: ${msg}`;
}

/** Hide loading spinner and populate the static stats line. */
export function showStats() {
    state.dom.loading.style.display = 'none';
    state.dom.stats.textContent =
        `${state.stats.totalSegments.toLocaleString()} segs | ` +
        `${state.stats.junctionCount.toLocaleString()} junctions | ` +
        `${getLevelCount()} grid levels`;
}

/** Build grid meter bars (call once after data load). */
export function initGridMeter() {
    const meter = state.dom.gridMeter;
    meter.innerHTML = '';
    const count = getLevelCount();
    for (let i = 0; i < count; i++) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        meter.appendChild(bar);
    }
}

// ---------------------------------------------------------------
// Per-frame updates (called from render-manager draw loop)
// ---------------------------------------------------------------

/** Update zoom readout. */
export function updateZoom() {
    state.dom.zoomVal.textContent = state.zoom < 1
        ? state.zoom.toFixed(4) : state.zoom.toFixed(1);
}

let prevLevel = -1;

/** Light up grid meter bars and update skeleton level readout. */
export function updateSkeletonLevel(levelIndex) {
    if (levelIndex === prevLevel) return false;
    prevLevel = levelIndex;

    // Grid meter bars
    const bars = state.dom.gridMeter.children;
    const n = bars.length;
    for (let i = 0; i < n; i++) {
        bars[i].classList.toggle('active', i < n - levelIndex);
    }

    // Level info
    const meta = getLevelMeta();
    state.dom.levelLabel.textContent = meta.label;
    state.dom.nodeCount.textContent = meta.nodeCount.toLocaleString();
    state.dom.polylineCount.textContent = meta.polylineCount.toLocaleString();
    const pct = ((1 - meta.nodeCount / state.stats.totalSegments) * 100).toFixed(1);
    state.dom.reduction.textContent = `${pct}%`;
    return true;
}

/** Update visible polyline / junction counts. */
export function updateVisibleCounts(visiblePl, visibleJ) {
    state.dom.visibleCount.textContent = `${visiblePl.toLocaleString()} / ${visibleJ.toLocaleString()}`;
}

/** Update viewport coordinate readout. */
export function updateViewportBp(vp) {
    const chr = state.chromosome;
    if (chr) {
        const bpLeft = xToBp(vp.minX);
        const bpRight = xToBp(vp.maxX);
        if (bpLeft !== null && bpRight !== null) {
            state.dom.viewportBp.textContent = `${chr}:${formatBp(bpLeft)}-${formatBp(bpRight)}`;
        }
    }
}

// ---------------------------------------------------------------
// Detail bar
// ---------------------------------------------------------------

/** Flush detail data stats to the detail bar. */
export function updateDetailBar() {
    if (!state.detailData) return;
    state.dom.detailChains.textContent = state.detailData.chains.length.toLocaleString();
    state.dom.detailExposed.textContent = '0';
    state.dom.detailNodes.textContent = (state.detailData.totalBubbles || 0).toLocaleString();
    if (state.detailData.bpStart != null) {
        state.dom.detailRange.textContent = `${formatBp(state.detailData.bpStart)}-${formatBp(state.detailData.bpEnd)}`;
    }
    state.dom.detailOpacity.textContent = state.detailOpacity.toFixed(2);
    const steps = viewportStepCount();
    state.dom.detailSteps.textContent = isFinite(steps) ? Math.round(steps).toLocaleString() : '--';
}

/** Update detail phase indicator (className + text). */
export function updateDetailPhase() {
    const phase = state.detailPhase;
    const cls = (phase === 'fading-in' || phase === 'fading-out') ? 'fading' : phase;
    state.dom.detailPhase.className = cls;
    if (phase === 'none') {
        state.dom.detailPhase.textContent = 'DETAILS';
    } else {
        state.dom.detailPhase.textContent = `DETAILS ${state.detailOpacity.toFixed(2)}`;
    }
}

/** Update just the opacity readout (called during fade animation). */
export function updateDetailOpacityReadout() {
    state.dom.detailOpacity.textContent = state.detailOpacity.toFixed(2);
    state.dom.detailPhase.textContent = `DETAILS ${state.detailOpacity.toFixed(2)}`;
}

// ---------------------------------------------------------------
// Fetch indicator
// ---------------------------------------------------------------

export function updateFetchIndicator() {
    if (state.isFetching) {
        state.dom.fetchIndicator.classList.add('active');
        state.dom.detailPhase.className = 'fetching';
    } else {
        state.dom.fetchIndicator.classList.remove('active');
        updateDetailPhase();
    }
}

// ---------------------------------------------------------------
// Tooltip & cursor
// ---------------------------------------------------------------

export function updateCursorBp(text) {
    state.dom.cursorBp.textContent = text;
}

export function showTooltip(html, clientX, clientY) {
    const el = state.dom.tooltip;
    el.innerHTML = html;
    el.style.display = 'block';
    positionTooltip(el, clientX, clientY);
}

export function hideTooltip() {
    state.dom.tooltip.style.display = 'none';
}
