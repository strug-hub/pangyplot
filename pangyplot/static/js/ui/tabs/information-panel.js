import { isDebugMode } from "../../graph/graph-data/graph-state.js";

var fullSequence = "";

const panel = document.getElementById('info-selected-container');
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

export function updateGraphInformation(status) {
  if (!isDebugMode()) {
    debugContainer.style.display = 'none';
    return;
  }

  //TODO make dynamic too

  const elementFPS = document.getElementById('info-fps');
  elementFPS.textContent = status.fps;

  const elementNodes = document.getElementById('info-graph-nodes');
  elementNodes.textContent = ` ${status.nodes}`;
  const elementLinks = document.getElementById('info-graph-links');
  elementLinks.textContent = ` ${status.links}`;

  const elementCanvasCoord = document.getElementById('info-canvas-coordinates');
  elementCanvasCoord.textContent = ` (${status.canvasX}, ${status.canvasY})`;

  const elementScreenCoord = document.getElementById('info-screen-coordinates');
  elementScreenCoord.textContent = ` (${status.screenX}, ${status.screenY})`;

}
