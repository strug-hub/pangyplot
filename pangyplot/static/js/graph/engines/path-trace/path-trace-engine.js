// Path trace engine: fetches samples/paths, wires UI, coordinates resolution.

import { fetchData, buildUrl } from '../../../utils/network-utils.js';
import { state } from '../../state.js';
import {
    setActiveSample, setSubpaths, setActiveSubpath,
    setResolvedPath, setRenderData, clearPathTrace,
} from './path-trace-state.js';
import { resolvePath, buildRenderData, rebuildBubbleToChainIndex } from './path-trace-resolver.js';
import { setupAnimationUi, resetAnimation } from './path-trace-animation.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';
import createSelectableTable from '@ui/components/selectable-table.js';

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
        _fetchAndResolvePath(sample);
    });

}

// ---------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------

async function _fetchAndResolvePath(sample) {
    const dd = state.detailData;
    if (!dd) {
        console.warn('[path-trace] No detail data — path fetch requires active detail view');
        return;
    }

    const params = {
        sample,
        genome: state.GENOME,
        chromosome: state.chromosome,
        start: dd.bpStart || 0,
        end: dd.bpEnd || 0,
    };

    let paths;
    try {
        const url = buildUrl('/path', params);
        paths = await fetchData(url, 'path-trace');
    } catch (e) {
        console.warn('[path-trace] fetch failed:', e);
        return;
    }

    setSubpaths(paths);
    _createPathTable(paths);
}

// ---------------------------------------------------------------
// Resolution (called when subpath selected or after pop/unpop)
// ---------------------------------------------------------------

/**
 * Resolve the active subpath and update render data.
 * Also used for re-resolution after pop/unpop.
 */
export function resolveAndBuild(subpath) {
    if (!subpath?.path) {
        setResolvedPath([]);
        setRenderData(null);
        return;
    }

    rebuildBubbleToChainIndex();
    const resolved = resolvePath(subpath.path);
    setResolvedPath(resolved);

    const rd = buildRenderData(resolved);
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

function _createPathTable(paths) {
    const container = document.getElementById('path-table-container');
    const animContainer = document.getElementById('path-animation-container');
    if (!container) return;

    container.innerHTML = '';
    container.classList.remove('no-data');

    if (!paths?.length) {
        container.textContent = 'No path data available.';
        container.classList.add('no-data');
        return;
    }

    const tableData = paths.map(sp => ({
        item: sp,
        label: `${sp.contig}:${sp.start}-${sp.start + sp.length}`,
    }));

    const table = createSelectableTable('path', tableData, 'Subpaths');
    container.appendChild(table);

    table.addEventListener('path-row-select', (e) => {
        const subpath = e.detail.item;
        setActiveSubpath(subpath);
        _localActiveSubpath = subpath;
        resolveAndBuild(subpath);

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
