import { nodeRecordLookup, linkRecordLookup, nodeAdjacencyLookup } from "./records-manager.js";

export function installRecordsInspector({ onHighlightNode } = {}) {
  const root = document.createElement('div');
  root.id = 'records-inspector';
  root.innerHTML = `
    <div class="ri-header">
      <strong>Records Inspector</strong>
      <div class="ri-actions">
        <input id="ri-filter" placeholder="Filter by id…" />
        <button id="ri-refresh">Refresh</button>
        <button id="ri-export">Export JSON</button>
        <button id="ri-close" title="Close (Ctrl+Alt+R)">✕</button>
      </div>
    </div>
    <div class="ri-stats" id="ri-stats"></div>
    <div class="ri-tabs">
      <button data-tab="nodes" class="active">Nodes</button>
      <button data-tab="links">Links</button>
      <button data-tab="adj">Adjacency</button>
    </div>
    <div class="ri-content">
      <div id="ri-nodes" class="ri-tab active"></div>
      <div id="ri-links" class="ri-tab"></div>
      <div id="ri-adj" class="ri-tab">
        <div class="ri-row">
          <input id="ri-adj-input" placeholder="Node ID for adjacency…" />
          <button id="ri-adj-btn">Load</button>
        </div>
        <div id="ri-adj-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    #records-inspector { position: fixed; right: 12px; bottom: 12px; width: 460px; max-height: 70vh;
      background: #111; color: #eaeaea; border: 1px solid #333; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.4);
      display: none; overflow: hidden; font: 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; z-index: 999999;
    }
    #records-inspector .ri-header { display:flex; justify-content: space-between; align-items:center; padding: 8px 10px; background:#181818; border-bottom:1px solid #2a2a2a; }
    #records-inspector .ri-actions { display:flex; gap:6px; align-items:center; }
    #records-inspector input { background:#1e1e1e; color:#ddd; border:1px solid #333; border-radius: 8px; padding:6px 8px; }
    #records-inspector button { background:#222; color:#ddd; border:1px solid #333; border-radius:8px; padding:6px 10px; cursor:pointer; }
    #records-inspector button:hover { background:#2a2a2a; }
    #records-inspector .ri-stats { padding: 8px 10px; border-bottom:1px solid #2a2a2a; display:flex; gap:14px; flex-wrap:wrap; }
    #records-inspector .ri-tabs { display:flex; gap:4px; padding: 6px 8px; border-bottom:1px solid #2a2a2a; }
    #records-inspector .ri-tabs button { padding:6px 10px; }
    #records-inspector .ri-tabs button.active { background:#2f2f2f; }
    #records-inspector .ri-content { max-height: 48vh; overflow:auto; }
    #records-inspector .ri-tab { display:none; padding:8px; }
    #records-inspector .ri-tab.active { display:block; }
    #records-inspector .ri-row { display:flex; gap:6px; margin-bottom:8px; }
    #records-inspector table { width:100%; border-collapse: collapse; }
    #records-inspector th, #records-inspector td { border-bottom:1px solid #2a2a2a; padding:6px 4px; text-align:left; }
    #records-inspector .ri-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    #records-inspector .ri-pill { background:#1e1e1e; border:1px solid #333; border-radius:999px; padding:2px 8px; }
  `;
  document.head.appendChild(style);

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
    adjInput: root.querySelector('#ri-adj-input'),
    adjBtn: root.querySelector('#ri-adj-btn'),
    adjBody: root.querySelector('#ri-adj-body'),
  };

  function snapshot() {
    // Safe, small projection (avoid circular references)
    const nodes = [...nodeRecordLookup.values()].map(r => ({
      id: r.id, active: !!r.active,
      insideCount: r.inside ? (r.inside.size ?? r.inside.length ?? 0) : 0,
      nodeElements: r.nodeElements?.length ?? 0,
      linkElements: r.linkElements?.length ?? 0,
    }));
    const links = [...linkRecordLookup.values()].map(l => ({
      id: l.id, sourceId: l.sourceId, targetId: l.targetId,
      incomplete: l.isIncomplete?.() ?? null,
    }));
    return { nodes, links };
  }

  function renderStats() {
    const n = nodeRecordLookup.size;
    const l = linkRecordLookup.size;
    const inc = [...linkRecordLookup.values()].reduce((a, r) => a + (r.isIncomplete?.() ? 1 : 0), 0);
    ui.stats.innerHTML = `
      <span class="ri-pill">nodes: <b>${n}</b></span>
      <span class="ri-pill">links: <b>${l}</b></span>
      <span class="ri-pill">incomplete links: <b>${inc}</b></span>
    `;
  }

  function renderNodes() {
    const { nodes } = snapshot();
    const q = ui.filter.value?.trim().toLowerCase();
    const rows = q ? nodes.filter(n => String(n.id).toLowerCase().includes(q)) : nodes.slice(0, 500);
    ui.panelNodes.innerHTML = `
      <table>
        <thead><tr><th>ID</th><th>active</th><th>inside</th><th>nodeEls</th><th>linkEls</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="ri-mono"><button data-act="hi" data-id="${r.id}" title="Highlight">${r.id}</button></td>
              <td>${r.active ? '✔' : ''}</td>
              <td>${r.insideCount}</td>
              <td>${r.nodeElements}</td>
              <td>${r.linkElements}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${rows.length < nodes.length ? `<div style="opacity:.7;padding:6px 2px">Showing ${rows.length}/${nodes.length} (filter to see more)</div>` : ''}
    `;
  }

  function renderLinks() {
    const { links } = snapshot();
    const q = ui.filter.value?.trim().toLowerCase();
    const rows = q ? links.filter(l =>
      String(l.id).toLowerCase().includes(q) ||
      String(l.sourceId).toLowerCase().includes(q) ||
      String(l.targetId).toLowerCase().includes(q)
    ) : links.slice(0, 500);
    ui.panelLinks.innerHTML = `
      <table>
        <thead><tr><th>ID</th><th>source</th><th>target</th><th>incomplete</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="ri-mono">${r.id}</td>
              <td class="ri-mono">${r.sourceId}</td>
              <td class="ri-mono">${r.targetId}</td>
              <td>${r.incomplete ? '⚠' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${rows.length < links.length ? `<div style="opacity:.7;padding:6px 2px">Showing ${rows.length}/${links.length} (filter to see more)</div>` : ''}
    `;
  }

  function renderAdj() {
    const nodeId = ui.adjInput.value.trim();
    const set = nodeAdjacencyLookup.get(nodeId) || new Set();
    const rows = [...set].map(l => ({
      id: l.id, sourceId: l.sourceId, targetId: l.targetId, incomplete: l.isIncomplete?.() ?? null
    }));
    ui.adjBody.innerHTML = rows.length
      ? `<table>
          <thead><tr><th>link</th><th>source</th><th>target</th><th>incomplete</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td class="ri-mono">${r.id}</td>
                <td class="ri-mono">${r.sourceId}</td>
                <td class="ri-mono">${r.targetId}</td>
                <td>${r.incomplete ? '⚠' : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
      : `<div style="opacity:.7">No adjacency for <b>${nodeId || '(empty)'}</b>.</div>`;
  }

  function renderAll() {
    renderStats();
    renderNodes();
    renderLinks();
    if (ui.panelAdj.classList.contains('active')) renderAdj();
  }

  // wiring
  ui.refresh.onclick = renderAll;
  ui.filter.oninput = () => { renderNodes(); renderLinks(); };
  ui.exportBtn.onclick = () => {
    const data = snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `records-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  ui.close.onclick = () => (root.style.display = 'none');
  ui.adjBtn.onclick = renderAdj;

  // tab switching
  ui.tabs.forEach(btn => {
    btn.onclick = () => {
      ui.tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      root.querySelectorAll('.ri-tab').forEach(p => p.classList.remove('active'));
      root.querySelector(`#ri-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'adj') renderAdj();
    };
  });

  // highlight hook from the table
  ui.panelNodes.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act="hi"]');
    if (!btn) return;
    const id = btn.dataset.id;
    onHighlightNode?.(id);
  });

  // hotkey toggle
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
      root.style.display = (root.style.display === 'none' || !root.style.display) ? 'block' : 'none';
      if (root.style.display === 'block') renderAll();
    }
  });

  // expose tiny API
  return {
    open() { root.style.display = 'block'; renderAll(); },
    close() { root.style.display = 'none'; },
    refresh: renderAll,
  };
}


