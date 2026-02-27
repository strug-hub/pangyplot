import { nodeRecordLookup, linkRecordLookup, nodeAdjacencyLookup, geneRecordLookup } from "./records-manager-implementation.js";
import viewState from "../view-state.js";

export function installRecordsInspector({ onHighlightNode } = {}) {

  // Load external CSS
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = '/static/css/graph/records-inspector.css';
  document.head.appendChild(cssLink);

  const root = document.createElement('div');
  root.id = 'records-inspector';
  root.innerHTML = `
    <div class="ri-header">
      <strong>Records Inspector</strong>
      <div class="ri-actions">
        <input id="ri-filter" placeholder="Filter by id..." />
        <button id="ri-refresh" title="Refresh data">Refresh</button>
        <button id="ri-export" title="Download JSON snapshot">Export</button>
        <button id="ri-close" title="Close (Ctrl+Alt+R)">x</button>
      </div>
    </div>
    <div class="ri-stats" id="ri-stats"></div>
    <div class="ri-tabs">
      <button data-tab="nodes" class="active">Nodes</button>
      <button data-tab="links">Links</button>
      <button data-tab="adj">Adjacency</button>
      <button data-tab="viewstate">ViewState</button>
    </div>
    <div class="ri-content">
      <div id="ri-nodes" class="ri-tab active"></div>
      <div id="ri-links" class="ri-tab"></div>
      <div id="ri-adj" class="ri-tab">
        <div class="ri-row">
          <input id="ri-adj-input" placeholder="Node ID (e.g. b107, s42)..." />
          <button id="ri-adj-btn">Load</button>
        </div>
        <div id="ri-adj-body"></div>
      </div>
      <div id="ri-viewstate" class="ri-tab"></div>
    </div>
  `;
  document.body.appendChild(root);

  const ui = {
    root,
    filter: root.querySelector('#ri-filter'),
    refresh: root.querySelector('#ri-refresh'),
    exportBtn: root.querySelector('#ri-export'),
    close: root.querySelector('#ri-close'),
    stats: root.querySelector('#ri-stats'),
    tabs: root.querySelectorAll('.ri-tabs button'),
    panelNodes: root.querySelector('#ri-nodes'),
    panelLinks: root.querySelector('#ri-links'),
    panelAdj: root.querySelector('#ri-adj'),
    panelViewState: root.querySelector('#ri-viewstate'),
    adjInput: root.querySelector('#ri-adj-input'),
    adjBtn: root.querySelector('#ri-adj-btn'),
  };

  function snapshotNodes() {
    return [...nodeRecordLookup.values()].map(r => ({
      id: r.id,
      type: r.type,
      active: !!r.active,
      seqLength: r.seqLength ?? 0,
      insideCount: r.inside ? r.inside.size : 0,
      popped: !!(r.popData),
      nodeEls: r.elements?.nodes?.length ?? 0,
      linkEls: r.elements?.links?.length ?? 0,
      hasCoords: !!(r.coords?.x1 != null),
    }));
  }

  function snapshotLinks() {
    return [...linkRecordLookup.values()].map(l => ({
      id: l.id,
      sourceId: l.sourceId,
      targetId: l.targetId,
      type: l.type || "link",
      fromStrand: l.fromStrand || "+",
      toStrand: l.toStrand || "+",
      incomplete: l.isIncomplete(),
      isDel: !!l.isDel,
    }));
  }

  function renderStats() {
    const n = nodeRecordLookup.size;
    const bubbles = [...nodeRecordLookup.values()].filter(r => r.type === "bubble").length;
    const segments = n - bubbles;
    const popped = [...nodeRecordLookup.values()].filter(r => r.popData).length;
    const l = linkRecordLookup.size;
    const inc = [...linkRecordLookup.values()].reduce((a, r) => a + (r.isIncomplete() ? 1 : 0), 0);
    const chains = [...linkRecordLookup.values()].filter(r => r.isChainLink).length;
    const genes = geneRecordLookup.size;
    const vsSize = viewState.segmentToNode.size;

    ui.stats.innerHTML = `
      <span class="ri-pill">bubbles: <b>${bubbles}</b></span>
      <span class="ri-pill">segments: <b>${segments}</b></span>
      <span class="ri-pill">links: <b>${l}</b>${chains ? ` (${chains} chain)` : ''}</span>
      ${inc ? `<span class="ri-pill ri-incomplete">incomplete: <b>${inc}</b></span>` : ''}
      ${popped ? `<span class="ri-pill ri-popped">popped: <b>${popped}</b></span>` : ''}
      ${genes ? `<span class="ri-pill">genes: <b>${genes}</b></span>` : ''}
      <span class="ri-pill">viewState: <b>${vsSize}</b> segs</span>
    `;
  }

  function renderNodes() {
    const nodes = snapshotNodes();
    const q = ui.filter.value?.trim().toLowerCase();
    const rows = q ? nodes.filter(n => String(n.id).toLowerCase().includes(q)) : nodes.slice(0, 500);

    if (!rows.length) {
      ui.panelNodes.innerHTML = `<div class="ri-empty">${q ? 'No nodes match filter.' : 'No node records.'}</div>`;
      return;
    }

    ui.panelNodes.innerHTML = `
      <table>
        <thead><tr><th>ID</th><th>type</th><th>length</th><th>inside</th><th>els</th><th>status</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><button class="ri-id-btn" data-act="detail" data-id="${r.id}">${r.id}</button></td>
              <td class="${r.type === 'bubble' ? 'ri-type-bubble' : 'ri-type-segment'}">${r.type}</td>
              <td>${r.seqLength > 0 ? r.seqLength.toLocaleString() + ' bp' : '-'}</td>
              <td>${r.insideCount || ''}</td>
              <td>${r.nodeEls}n ${r.linkEls}l</td>
              <td>${r.popped ? '<span class="ri-popped">popped</span>' : ''}${r.active ? '' : ' inactive'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${rows.length < nodes.length ? `<div class="ri-empty">Showing ${rows.length}/${nodes.length} (filter to see more)</div>` : ''}
    `;
  }

  function renderLinks() {
    const links = snapshotLinks();
    const q = ui.filter.value?.trim().toLowerCase();
    const rows = q ? links.filter(l =>
      String(l.id).toLowerCase().includes(q) ||
      String(l.sourceId).toLowerCase().includes(q) ||
      String(l.targetId).toLowerCase().includes(q)
    ) : links.slice(0, 500);

    if (!rows.length) {
      ui.panelLinks.innerHTML = `<div class="ri-empty">${q ? 'No links match filter.' : 'No link records.'}</div>`;
      return;
    }

    ui.panelLinks.innerHTML = `
      <table>
        <thead><tr><th>source</th><th>strand</th><th>target</th><th>type</th><th>status</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><button class="ri-id-btn" data-act="filter" data-id="${r.sourceId}">${r.sourceId}</button></td>
              <td>${r.fromStrand}/${r.toStrand}</td>
              <td><button class="ri-id-btn" data-act="filter" data-id="${r.targetId}">${r.targetId}</button></td>
              <td>${r.type === 'chain' ? '<span class="ri-chain">chain</span>' : r.type}${r.isDel ? ' del' : ''}</td>
              <td>${r.incomplete ? '<span class="ri-incomplete">incomplete</span>' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${rows.length < links.length ? `<div class="ri-empty">Showing ${rows.length}/${links.length} (filter to see more)</div>` : ''}
    `;
  }

  function renderAdj() {
    const nodeId = ui.adjInput.value.trim();
    if (!nodeId) {
      root.querySelector('#ri-adj-body').innerHTML = `<div class="ri-empty">Enter a node ID above.</div>`;
      return;
    }
    const set = nodeAdjacencyLookup.get(nodeId) || new Set();
    const rows = [...set]
      .map(linkId => linkRecordLookup.get(linkId))
      .filter(Boolean)
      .map(l => ({
        id: l.id, sourceId: l.sourceId, targetId: l.targetId,
        type: l.type || "link",
        fromStrand: l.fromStrand || "+",
        toStrand: l.toStrand || "+",
        incomplete: l.isIncomplete(),
      }));

    root.querySelector('#ri-adj-body').innerHTML = rows.length
      ? `<table>
          <thead><tr><th>source</th><th>strand</th><th>target</th><th>type</th><th>status</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.sourceId}</td>
                <td>${r.fromStrand}/${r.toStrand}</td>
                <td>${r.targetId}</td>
                <td>${r.type === 'chain' ? '<span class="ri-chain">chain</span>' : r.type}</td>
                <td>${r.incomplete ? '<span class="ri-incomplete">incomplete</span>' : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
      : `<div class="ri-empty">No adjacency entries for <b>${nodeId}</b>.</div>`;
  }

  function renderViewState() {
    const q = ui.filter.value?.trim().toLowerCase();
    const entries = [...viewState.segmentToNode.entries()];
    const rows = q
      ? entries.filter(([segId, record]) =>
          segId.includes(q) || String(record.id).toLowerCase().includes(q))
      : entries.slice(0, 500);

    if (!rows.length) {
      ui.panelViewState.innerHTML = `<div class="ri-empty">${q ? 'No mappings match filter.' : 'ViewState is empty.'}</div>`;
      return;
    }

    ui.panelViewState.innerHTML = `
      <table>
        <thead><tr><th>seg ID</th><th>maps to</th><th>owner type</th></tr></thead>
        <tbody>
          ${rows.map(([segId, record]) => `
            <tr>
              <td>s${segId}</td>
              <td><button class="ri-id-btn" data-act="filter" data-id="${record.id}">${record.id}</button></td>
              <td class="${record.type === 'bubble' ? 'ri-type-bubble' : 'ri-type-segment'}">${record.type}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${rows.length < entries.length ? `<div class="ri-empty">Showing ${rows.length}/${entries.length} (filter to see more)</div>` : ''}
    `;
  }

  function showDetail(id) {
    const nodeRecord = nodeRecordLookup.get(id);
    const panel = getActivePanel();
    if (!nodeRecord || !panel) return;

    // Remove existing detail
    const existing = panel.querySelector('.ri-detail');
    if (existing) existing.remove();

    const detail = document.createElement('div');
    detail.className = 'ri-detail';

    const fields = {
      id: nodeRecord.id,
      type: nodeRecord.type,
      seqLength: nodeRecord.seqLength,
      coords: nodeRecord.coords ? `(${nodeRecord.coords.x1?.toFixed(1)}, ${nodeRecord.coords.y1?.toFixed(1)}) -> (${nodeRecord.coords.x2?.toFixed(1)}, ${nodeRecord.coords.y2?.toFixed(1)})` : 'none',
      active: nodeRecord.active,
      inside: nodeRecord.inside?.size ?? 0,
      popped: !!(nodeRecord.popData),
      elements: `${nodeRecord.elements?.nodes?.length ?? 0} nodes, ${nodeRecord.elements?.links?.length ?? 0} links`,
      ranges: nodeRecord.ranges ? JSON.stringify(nodeRecord.ranges) : 'none',
    };

    if (nodeRecord.type === "bubble") {
      fields.subtype = nodeRecord.subtype;
      fields.chain = nodeRecord.chain;
      fields.chainStep = nodeRecord.chainStep;
      fields.siblings = JSON.stringify(nodeRecord.siblings);
      fields.sourceSegs = JSON.stringify(nodeRecord.sourceSegs);
      fields.sinkSegs = JSON.stringify(nodeRecord.sinkSegs);
      fields.size = nodeRecord.size;
    }
    if (nodeRecord.type === "segment") {
      fields.insideBubble = nodeRecord.insideBubble;
      fields.seq = nodeRecord.seq ? (nodeRecord.seq.length > 80 ? nodeRecord.seq.slice(0, 80) + '...' : nodeRecord.seq) : 'none';
    }

    detail.innerHTML = `<button class="ri-detail-close" title="Close detail">x</button>`
      + Object.entries(fields).map(([k, v]) => `<b>${k}:</b> ${v}`).join('\n');

    detail.querySelector('.ri-detail-close').onclick = () => detail.remove();
    panel.prepend(detail);
  }

  function getActivePanel() {
    return root.querySelector('.ri-tab.active');
  }

  function renderActiveTab() {
    const active = root.querySelector('.ri-tabs button.active');
    if (!active) return;
    const tab = active.dataset.tab;
    if (tab === 'nodes') renderNodes();
    else if (tab === 'links') renderLinks();
    else if (tab === 'adj') renderAdj();
    else if (tab === 'viewstate') renderViewState();
  }

  function renderAll() {
    renderStats();
    renderActiveTab();
  }

  // Wiring
  ui.refresh.onclick = renderAll;
  ui.filter.oninput = renderActiveTab;
  ui.exportBtn.onclick = () => {
    const data = {
      nodes: snapshotNodes(),
      links: snapshotLinks(),
      viewState: [...viewState.segmentToNode.entries()].map(([segId, r]) => ({ segId, nodeId: r.id })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `records-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  ui.close.onclick = () => (root.style.display = 'none');
  ui.adjBtn.onclick = renderAdj;

  // Tab switching
  ui.tabs.forEach(btn => {
    btn.onclick = () => {
      ui.tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      root.querySelectorAll('.ri-tab').forEach(p => p.classList.remove('active'));
      root.querySelector(`#ri-${btn.dataset.tab}`).classList.add('active');
      renderActiveTab();
    };
  });

  // Click handlers on tables (detail view + filter shortcuts)
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const action = btn.dataset.act;
    const id = btn.dataset.id;

    if (action === 'detail') {
      showDetail(id);
      onHighlightNode?.(id);
    } else if (action === 'filter') {
      ui.filter.value = id;
      renderActiveTab();
    }
  });

  // Hotkey toggle
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
      root.style.display = (root.style.display === 'none' || !root.style.display) ? 'block' : 'none';
      if (root.style.display === 'block') renderAll();
    }
  });

  return {
    open() { root.style.display = 'block'; renderAll(); },
    close() { root.style.display = 'none'; },
    refresh: renderAll,
  };
}
