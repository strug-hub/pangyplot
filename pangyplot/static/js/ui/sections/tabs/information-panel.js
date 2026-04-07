import { isDebugMode } from '@app-state';
import eventBus from '@event-bus';
import { formatBp } from '@format-utils';
import { state } from '../../../graph/state.js';

const panel = document.getElementById('info-selected-container');
const selectionPanel = document.getElementById('info-selection-container');
const debugOuterContainer = document.getElementById('info-debug-container-outer');
const debugContainer = document.getElementById('info-debug-container');

// Hide debug panel when debug mode is toggled off
eventBus.subscribe('app:debug-mode-changed', (enabled) => {
    if (!enabled && debugOuterContainer) {
        debugOuterContainer.classList.add('hidden');
        debugContainer.innerHTML = '';
    }
});

const t = JSON.parse(document.getElementById('info-panel-i18n').textContent);

function appendRow({ label, valueEl }) {
  const row = document.createElement('div');
  row.className = 'info-row';

  const l = document.createElement('div');
  l.className = 'info-label';
  l.textContent = label;

  const v = document.createElement('div');
  v.className = 'info-value';
  v.appendChild(valueEl);

  row.append(l, v);
  panel.appendChild(row);
}

function appendHeader(html) {
  const header = document.createElement('div');
  header.className = 'info-type-header';
  header.innerHTML = html;
  panel.appendChild(header);
}

function makeCopyable(value, { allowHTML = false, monospace = false, copyString = null } = {}) {
  if (copyString === null) copyString = String(value);
  const el = document.createElement('span');
  el.className = 'info-copyable' + (monospace ? ' info-code' : '');
  el.setAttribute('data-copy', copyString);
  if (allowHTML) {
    el.innerHTML = value;
  } else {
    el.textContent = value;
  }
  return el;
}

function makeText(value) {
  const el = document.createElement('span');
  el.textContent = value;
  return el;
}


function renderSegmentInfo(info) {
  appendHeader(`\u25A1 ${t.segment}`);

  appendRow({ label: t.id, valueEl: makeCopyable(info.id, { allowHTML: true, copyString: info.rawId }) });

  if (info.coordinates) {
    appendRow({ label: t.coordinates, valueEl: makeCopyable(info.coordinates) });
  }

  appendRow({ label: t.length, valueEl: makeText(formatBp(info.length, { unit: true })) });

  if (info.gcPercent != null) {
    appendRow({ label: t.gcContent, valueEl: makeText(info.gcPercent) });
  }

  if (info.nCount != null && info.nCount > 0) {
    appendRow({ label: t.nCount, valueEl: makeText(Number(info.nCount).toLocaleString()) });
  }

  if (info.seq) {
    appendRow({ label: t.sequence, valueEl: makeCopyable(info.seq, { monospace: true }) });
  }
}

function renderBubbleInfo(info) {
  appendHeader(`\u25CB ${t.bubble}`);

  appendRow({ label: t.id, valueEl: makeCopyable(info.id, { allowHTML: true, copyString: info.rawId }) });

  if (info.coordinates) {
    appendRow({ label: t.coordinates, valueEl: makeCopyable(info.coordinates) });
  }

  if (info.subtype) {
    appendRow({ label: t.subtype, valueEl: makeText(info.subtype) });
  }

  appendRow({ label: t.length, valueEl: makeText(formatBp(info.length, { unit: true })) });

  if (info.size != null) {
    appendRow({ label: t.insideSegments, valueEl: makeText(Number(info.size).toLocaleString()) });
  }

  if (info.gcPercent != null) {
    appendRow({ label: t.gcContent, valueEl: makeText(info.gcPercent) });
  }

  if (info.chain != null) {
    const chainText = info.chainStep != null
      ? `${info.chain} step ${info.chainStep}`
      : String(info.chain);
    appendRow({ label: t.chain, valueEl: makeText(chainText) });
  }

  if (info.parent != null) {
    const parentLabel = `\u25CB ${info.parent}`;
    appendRow({ label: t.parent, valueEl: makeCopyable(parentLabel, { allowHTML: true, copyString: String(info.parent) }) });
  }

  if (info.siblings) {
    const [prev, next] = info.siblings;
    if (prev != null || next != null) {
      const parts = [];
      if (prev != null) parts.push(`\u2190 ${prev}`);
      if (next != null) parts.push(`${next} \u2192`);
      appendRow({ label: t.siblings, valueEl: makeText(parts.join(' \u00b7 ')) });
    }
  }
}

function renderChainInfo(info) {
  appendHeader(`\u25C7 ${t.chain || 'Chain'}`);

  appendRow({ label: t.id, valueEl: makeCopyable(info.id, { allowHTML: true, copyString: info.rawId }) });

  if (info.coordinates) {
    appendRow({ label: t.coordinates, valueEl: makeCopyable(info.coordinates) });
  }

  if (info.subtype) {
    appendRow({ label: t.subtype, valueEl: makeText(info.subtype) });
  }

  appendRow({ label: t.length, valueEl: makeText(formatBp(info.length, { unit: true })) });

  if (info.size != null) {
    appendRow({ label: t.insideSegments || 'Bubbles', valueEl: makeText(Number(info.size).toLocaleString()) });
  }

  if (info.gcPercent != null) {
    appendRow({ label: t.gcContent, valueEl: makeText(info.gcPercent) });
  }

  if (info.parent != null) {
    const parentLabel = `\u25C7 ${info.parent}`;
    appendRow({ label: t.parent, valueEl: makeCopyable(parentLabel, { allowHTML: true, copyString: String(info.parent) }) });
  }
}

export function updateSelectionInfo(info) {
  panel.innerHTML = '';

  if (!info) return;

  if (info.type === 'segment') {
    renderSegmentInfo(info);
  } else if (info.type === 'bubble') {
    renderBubbleInfo(info);
  } else if (info.type === 'chain') {
    renderChainInfo(info);
  }

  if (isDebugMode() && info.range) {
    appendRow({ label: 'Range (debug):', valueEl: makeCopyable(info.range, { allowHTML: true }) });
  }
}

function showCopyPopup(el) {
  const popup = document.createElement('div');
  popup.textContent = 'Copied!';
  popup.id = 'copyPopup';
  document.body.appendChild(popup);

  const rect = el.getBoundingClientRect();
  popup.style.position = 'absolute';
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${window.scrollY + rect.top - 30}px`;

  setTimeout(() => {
    popup.style.opacity = '0';
    setTimeout(() => popup.remove(), 500);
  }, 800);
}

panel.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-copy]');
  if (!target) return;
  const text = target.getAttribute('data-copy');
  try {
    await navigator.clipboard.writeText(text);
    target.classList.add('info-copy-flash');
    showCopyPopup(target);
    setTimeout(() => target.classList.remove('info-copy-flash'), 200);
  } catch {}
});

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

export function updateSelectionSummary() {
    const count = state.selectedChains.size;
    const objCount = state.selectedObjects.size;
    if (count === 0 && objCount === 0) {
        selectionPanel.classList.add('hidden');
        selectionPanel.innerHTML = '';
        return;
    }

    selectionPanel.innerHTML = '';
    selectionPanel.classList.remove('hidden');

    const header = document.createElement('div');
    header.className = 'info-type-header';
    header.textContent = t.selection || 'Selection';
    selectionPanel.appendChild(header);

    if (count > 0) {
        const row = document.createElement('div');
        row.className = 'info-row';
        const label = document.createElement('div');
        label.className = 'info-label';
        label.textContent = t.chains || 'chains';
        const val = document.createElement('div');
        val.className = 'info-value';
        val.textContent = count;
        row.append(label, val);
        selectionPanel.appendChild(row);
    }

    if (objCount > 0) {
        const row = document.createElement('div');
        row.className = 'info-row';
        const label = document.createElement('div');
        label.className = 'info-label';
        label.textContent = t.segment || 'Segment';
        const val = document.createElement('div');
        val.className = 'info-value';
        val.textContent = objCount;
        row.append(label, val);
        selectionPanel.appendChild(row);
    }

    const range = getSelectionBpRange();
    if (range) {
        const chr = state.chromosome || '';
        const rangeText = `${chr}:${formatBp(range.bpStart)}\u2013${formatBp(range.bpEnd)}`;
        const row = document.createElement('div');
        row.className = 'info-row';
        const label = document.createElement('div');
        label.className = 'info-label';
        label.textContent = t.range || 'range';
        const val = document.createElement('div');
        val.className = 'info-value';
        val.textContent = rangeText;
        row.append(label, val);
        selectionPanel.appendChild(row);
    }

    let totalSize = 0;
    for (const chain of state.selectedChains.keys()) {
        if (chain.length) totalSize += chain.length;
    }
    if (totalSize > 0) {
        const row = document.createElement('div');
        row.className = 'info-row';
        const label = document.createElement('div');
        label.className = 'info-label';
        label.textContent = t.totalSize || 'total size';
        const val = document.createElement('div');
        val.className = 'info-value';
        val.textContent = formatBp(totalSize, { unit: true });
        row.append(label, val);
        selectionPanel.appendChild(row);
    }

}

export function clearSelectionSummary() {
    selectionPanel.classList.add('hidden');
    selectionPanel.innerHTML = '';
}

export function updateDebugInformation(status) {

  if (!isDebugMode()) {
    return;
  }

  debugOuterContainer.classList.remove('hidden');

  debugContainer.innerHTML = ""; // clear previous

  const table = document.createElement("table");
  table.className = "info-table";

  Object.entries(status).forEach(([key, value]) => {
    const row = document.createElement("tr");

    const keyCell = document.createElement("td");
    keyCell.className = "info-debug-key";
    keyCell.textContent = key;

    const valueCell = document.createElement("td");
    valueCell.className = "info-debug-value";
    valueCell.textContent = value;

    row.appendChild(keyCell);
    row.appendChild(valueCell);
    table.appendChild(row);
  });

  debugContainer.appendChild(table);
}
