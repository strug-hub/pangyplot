// Centralized UI status bar updates. All DOM writes to the info bar and detail
// bar flow through here. Other modules update simplify-state.js; the render
// loop (or event handlers) call these functions to flush state to the DOM.

import { state } from '../simplify-state.js';
import { formatBp } from '@format-utils';
import { layoutToBp } from '../engines/reference-spine-engine.js';
import { viewportBpSpan } from '../render/viewport.js';
import { getLevelCount, getLevelMeta } from '@simplify-data/chromosome-data.js';
import { positionTooltip } from '@ui/elements/tooltip.js';
import { isDebugMode } from '@app-state';
import eventBus from '@event-bus';
import { renderedJunctionNodes, renderedJunctionLinks } from '../detail/render/force-render-manager.js';
import { getRenderScale } from '../detail/engines/forces/pc-settings.js';

// Hide/show debug bars based on debug mode
function updateDebugBars(enabled) {
    const controls = document.getElementById('simplify-controls');
    const detailBar = document.getElementById('detail-bar');
    if (controls) controls.style.display = enabled ? '' : 'none';
    if (detailBar) detailBar.style.display = enabled ? '' : 'none';
}

updateDebugBars(isDebugMode());
eventBus.subscribe('app:debug-mode-changed', updateDebugBars);

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
    state.dom.gridVal.textContent = `[${state.targetGridSize.toFixed(0)}]`;
    const rs = getRenderScale();
    state.dom.renderScaleVal.textContent = rs.toFixed(2);
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
    state.dom.polylineCount.textContent = meta.polylineCount.toLocaleString();
    const pct = ((1 - meta.nodeCount / state.stats.totalSegments) * 100).toFixed(1);
    state.dom.reduction.textContent = `${pct}%`;
    return true;
}

/** Update visible polyline count. */
export function updateVisibleCounts(visiblePl) {
    state.dom.visibleCount.textContent = visiblePl.toLocaleString();
}

/** Update viewport coordinate readout. */
export function updateViewportBp(vp) {
    const chr = state.chromosome;
    if (chr) {
        const midY = (vp.minY + vp.maxY) / 2;
        const bpLeft = layoutToBp(vp.minX, midY);
        const bpRight = layoutToBp(vp.maxX, midY);
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
    const dd = state.detailData;
    state.dom.detailChains.textContent = dd.chains.length.toLocaleString();
    state.dom.detailExposed.textContent = '0';
    state.dom.detailNodes.textContent = (dd.totalBubbles || 0).toLocaleString();

    const jg = dd.junctionGraph || { nodes: [], links: [] };
    const totalJN = jg.nodes.length;
    const totalJL = (jg.links || []).length;
    state.dom.detailJNodes.textContent =
        `${renderedJunctionNodes.toLocaleString()}/${totalJN.toLocaleString()}`;
    state.dom.detailJLinks.textContent =
        `${renderedJunctionLinks.toLocaleString()}/${totalJL.toLocaleString()}`;

    if (dd.bpStart != null) {
        state.dom.detailRange.textContent = `${formatBp(dd.bpStart)}-${formatBp(dd.bpEnd)}`;
    }
    const bpSpan = viewportBpSpan();
    state.dom.detailSteps.textContent = isFinite(bpSpan) ? formatBp(bpSpan) : '--';
}

/** Update force node count in detail bar. */
export function updateDetailForceCount(count) {
    state.dom.detailForceNodes.textContent = count.toLocaleString();
}

/** Update fetch timing in detail bar. */
export function updateDetailFetchMs(ms) {
    state.dom.detailFetchMs.textContent = ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Update detail phase indicator (className + text). */
export function updateDetailPhase() {
    const phase = state.detailPhase;
    const cls = (phase === 'fading-in' || phase === 'fading-out') ? 'fading' : phase;
    state.dom.detailPhase.className = cls;
    state.dom.detailPhase.textContent = 'DETAILS';
}

/** Update just the phase readout (called during fade animation). */
export function updateDetailOpacityReadout() {
    // Phase indicator only — opacity no longer tracked in UI
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
