import DEBUG_MODE from "../../debug-mode.js";

var fullSequence = "";

const panel = document.getElementById('info-selected-container');
const debugOuterContainer = document.getElementById('info-debug-container-outer');
const debugContainer = document.getElementById('info-debug-container');

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

export function updateSelectedInfo(info) {
  panel.innerHTML = ''; 

  appendRow({ label: 'Node:', valueEl: makeCopyable(info.id, { allowHTML: true }) });
  appendRow({ label: 'Class:', valueEl: makeCopyable(info.type) });

  const positionText = `${info.genome}#${info.chromosome}:${info.start}-${info.end}`;
  appendRow({ label: 'Coordinates:', valueEl: makeCopyable(positionText) });

  appendRow({ label: 'Length:', valueEl: makeCopyable(info.length) });
  appendRow({ label: 'Children:', valueEl: makeCopyable(info.children) });
  appendRow({ label: 'Sequence:', valueEl: makeCopyable(info.seq, { monospace: true }) });

  // TODO: chain info? multi-select? frequency?
}

panel.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-copy]');
  if (!target) return;
  const text = target.getAttribute('data-copy');
  try {
    await navigator.clipboard.writeText(text);
    target.classList.add('copied');
    setTimeout(() => target.classList.remove('copied'), 700);
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
