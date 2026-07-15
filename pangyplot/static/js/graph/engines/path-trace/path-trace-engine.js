// Path trace engine: fetches samples/paths, wires UI, coordinates resolution.

import { fetchData, buildUrl } from '../../../utils/network-utils.js';
import { state } from '../../state.js';
import {
    setActiveSample, setSubpaths, setActiveSubpath,
    setDecodedPath, getDecodedPath,
    setRenderData, clearPathTrace,
} from './path-trace-state.js';
import { decodeSteps } from './path-codec.js';
import { resolveAndBuildRenderData } from './path-trace-boundary-resolver.js';
import { setupAnimationUi, resetAnimation } from './path-trace-animation.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import createSelectableTable from '@ui/components/selectable-table.js';
import eventBus from '@event-bus';

// Current viewport bp range (updated via event bus)
let _viewportStart = null;
let _viewportEnd = null;

// Cached meta entries for the active sample (unfiltered)
let _cachedMeta = null;
let _cachedSample = null;

// ---------------------------------------------------------------
// Setup
// ---------------------------------------------------------------

export async function setupPathTraceEngine() {
    const pathSelector = document.getElementById('path-selector');
    if (!pathSelector) return;

    // Fetch samples and populate dropdown
    let samples;
    try {
        samples = await fetchData('/samples', 'path-trace');
    } catch (e) {
        console.warn('[path-trace] failed to fetch samples:', e);
        return;
    }

    _populateDropdown(pathSelector, samples);
    setupAnimationUi();

    // On sample selection: fetch path data
    pathSelector.addEventListener('change', () => {
        const sample = pathSelector.value;
        if (!sample) return;
        setActiveSample(sample);
        _fetchPathMeta(sample);
    });

    // Viewport filter: re-filter table when viewport changes
    const filterCheckbox = document.getElementById('path-viewport-filter');
    if (filterCheckbox) {
        filterCheckbox.addEventListener('change', () => {
            if (_cachedMeta && _cachedSample) {
                _buildFilteredTable(_cachedMeta, _cachedSample);
            }
        });
    }

    let _filterTimer = null;
    let _regionTimer = null;
    eventBus.subscribe('ui:coordinates-changed', (data) => {
        _viewportStart = data.start;
        _viewportEnd = data.end;
        if (_cachedMeta && _cachedSample && _isFilterOn()) {
            if (_filterTimer) clearTimeout(_filterTimer);
            _filterTimer = setTimeout(() => {
                _buildFilteredTable(_cachedMeta, _cachedSample);
            }, 300);
        }

        // Region-scoped trace: the active subpath's on-screen portion changed
        // with the viewport, so re-fetch it for the new window and re-resolve.
        if (_localActiveSubpath) {
            if (_regionTimer) clearTimeout(_regionTimer);
            _regionTimer = setTimeout(() => { _refetchActiveSubpath(); }, 300);
        }
    });

}

/**
 * Re-fetch the active subpath for the current viewport and re-resolve it.
 * Called (debounced) when the viewport changes so the trace tracks the window.
 */
async function _refetchActiveSubpath() {
    const item = _localActiveSubpath;
    if (!item) return;
    const steps = await _fetchAndDecodePath(item._sample, item._fileIndex);
    if (!steps) return;
    item._steps = steps;
    resolveAndBuild(item);
}

// ---------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------

/**
 * Fetch path metadata for a sample and populate the subpath table.
 */
async function _fetchPathMeta(sample) {
    const params = {
        sample,
        chromosome: state.chromosome,
    };

    let meta;
    try {
        const url = buildUrl('/path-meta', params);
        meta = await fetchData(url, 'path-trace');
    } catch (e) {
        console.warn('[path-trace] meta fetch failed:', e);
        return;
    }

    _cachedMeta = meta;
    _cachedSample = sample;
    setSubpaths(meta);
    _buildFilteredTable(meta, sample);
}

/**
 * Fetch and decode a specific path's binary data.
 *
 * When a viewport window is known, the subpath is fetched region-scoped: the
 * server slices it to the segments in the window and re-encodes it, so we
 * download and decode only the on-screen portion instead of the whole walk.
 * Falls back to the whole subpath when no viewport/genome is available.
 * Caches the decoded result, keyed by region.
 */
async function _fetchAndDecodePath(sample, fileIndex) {
    const rStart = _viewportStart;
    const rEnd = _viewportEnd;
    const useRegion = rStart != null && rEnd != null && !!state.GENOME;

    const cacheKey = useRegion
        ? `${sample}:${fileIndex}:${Math.round(rStart)}-${Math.round(rEnd)}`
        : `${sample}:${fileIndex}:full`;

    const cached = getDecodedPath(cacheKey);
    if (cached) return cached;

    const params = {
        sample,
        chromosome: state.chromosome,
        index: fileIndex,
    };
    if (useRegion) {
        params.genome = state.GENOME;
        params.start = Math.round(rStart);
        params.end = Math.round(rEnd);
    }

    try {
        const url = buildUrl('/path-data', params);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // Browser auto-decompresses gzip (Content-Encoding: gzip),
        // so we receive raw varint bytes directly.
        const buffer = await response.arrayBuffer();
        const steps = decodeSteps(new Uint8Array(buffer));

        setDecodedPath(cacheKey, steps);
        return steps;
    } catch (e) {
        console.warn('[path-trace] binary fetch/decode failed:', e);
        return null;
    }
}

// ---------------------------------------------------------------
// Resolution (called when subpath selected or after pop/unpop)
// ---------------------------------------------------------------

/**
 * Resolve the active subpath using boundary-based resolution.
 * Produces render data (chain overlays, highlights) and animation frames.
 */
export function resolveAndBuild(subpath) {
    if (!subpath?._steps) {
        setRenderData(null);
        return;
    }

    const rd = resolveAndBuildRenderData(subpath._steps);
    setRenderData(rd);

    resetAnimation();
    scheduleFrame();
}

/**
 * Re-resolve the current active subpath.
 * Call after pop/unpop or detail data change.
 */
export function reResolve() {
    if (_localActiveSubpath) resolveAndBuild(_localActiveSubpath);
}

// Local ref to the active subpath (avoids re-reading module state)
let _localActiveSubpath = null;

// ---------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------

function _populateDropdown(select, samples) {
    select.innerHTML = '';

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select a sample...';
    blank.selected = true;
    blank.disabled = true;
    select.appendChild(blank);

    for (const s of samples) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
    }
}

function _createPathTable(metaEntries, sample) {
    const container = document.getElementById('path-table-container');
    const animContainer = document.getElementById('path-animation-container');
    if (!container) return;

    container.innerHTML = '';
    container.classList.remove('no-data');

    if (!metaEntries?.length) {
        container.textContent = 'No path data available.';
        container.classList.add('no-data');
        return;
    }

    const tableData = metaEntries.map((entry) => ({
        item: { ...entry, _sample: sample, _fileIndex: entry._origIndex },
        label: entry.length != null
            ? `${entry.contig}:${entry.start}-${entry.start + entry.length}`
            : `${entry.contig}:${entry.start}`,
    }));

    const table = createSelectableTable('path', tableData, 'Subpaths');
    container.appendChild(table);

    table.addEventListener('path-row-select', async (e) => {
        const item = e.detail.item;
        setActiveSubpath(item);

        // Fetch + decode binary path data on demand
        const steps = await _fetchAndDecodePath(item._sample, item._fileIndex);
        if (!steps) return;

        // Attach decoded steps to the item for resolution
        item._steps = steps;
        _localActiveSubpath = item;
        resolveAndBuild(item);

        if (animContainer) animContainer.classList.remove('hidden');
    });
}

function _clearPathTable() {
    const container = document.getElementById('path-table-container');
    if (container) {
        container.innerHTML = '';
        container.classList.remove('no-data');
    }
    const animContainer = document.getElementById('path-animation-container');
    if (animContainer) animContainer.classList.add('hidden');
    _localActiveSubpath = null;
}

function _isFilterOn() {
    const cb = document.getElementById('path-viewport-filter');
    return cb && cb.checked;
}

function _buildFilteredTable(meta, sample) {
    // Tag each entry with its original index for correct binary file lookup
    const tagged = meta.map((entry, idx) => ({ ...entry, _origIndex: idx }));

    if (!_isFilterOn() || _viewportStart === null || _viewportEnd === null) {
        _createPathTable(tagged, sample);
        return;
    }

    const filtered = tagged.filter(entry => {
        const bpStart = entry.bp_start;
        const bpEnd = entry.bp_end;
        if (bpStart == null || bpEnd == null) return true; // no range info → keep
        return bpEnd >= _viewportStart && bpStart <= _viewportEnd;
    });

    _createPathTable(filtered, sample);
}
