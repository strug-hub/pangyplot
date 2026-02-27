import DEBUG_MODE from "../../debug-mode.js";

const panel = document.getElementById('info-selected-container');
const debugOuterContainer = document.getElementById('info-debug-container-outer');
const debugContainer = document.getElementById('info-debug-container');

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

function formatBp(length) {
  if (length == null) return '?';
  return Number(length).toLocaleString() + ' bp';
}

function renderSegmentInfo(info) {
  appendHeader(`<i class="fa-regular fa-square"></i> ${t.segment}`);

  appendRow({ label: t.id, valueEl: makeCopyable(info.id, { allowHTML: true, copyString: info.rawId }) });

  if (info.coordinates) {
    appendRow({ label: t.coordinates, valueEl: makeCopyable(info.coordinates) });
  }

  appendRow({ label: t.length, valueEl: makeText(formatBp(info.length)) });

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
  appendHeader(`<i class="fa-regular fa-circle"></i> ${t.bubble}`);

  appendRow({ label: t.id, valueEl: makeCopyable(info.id, { allowHTML: true, copyString: info.rawId }) });

  if (info.coordinates) {
    appendRow({ label: t.coordinates, valueEl: makeCopyable(info.coordinates) });
  }

  if (info.subtype) {
    appendRow({ label: t.subtype, valueEl: makeText(info.subtype) });
  }

  appendRow({ label: t.length, valueEl: makeText(formatBp(info.length)) });

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
    const parentLabel = `<i class="fa-regular fa-circle"></i> ${info.parent}`;
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

export function updateSelectionInfo(info) {
  panel.innerHTML = '';

  if (!info) return;

  if (info.type === 'segment') {
    renderSegmentInfo(info);
  } else if (info.type === 'bubble') {
    renderBubbleInfo(info);
  }

  if (DEBUG_MODE && info.range) {
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

export function updateDebugInformation(status) {

  if (!DEBUG_MODE) {
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
