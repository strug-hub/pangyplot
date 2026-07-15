"""Render tools/architecture.json into a browsable single-page module map.

    python tools/architecture.py && python tools/architecture_html.py

Writes tools/architecture.html -- self-contained, no external assets.
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "tools", "architecture.json")
DEST = os.path.join(ROOT, "tools", "architecture.html")

HEAD = """<title>PangyPlot — Module Map</title>
<style>
:root {
  --ground:      #f4f6f6;
  --panel:       #ffffff;
  --panel-2:     #eaeeee;
  --rule:        #d3dada;
  --ink:         #16211f;
  --ink-soft:    #5a6b68;
  --ink-faint:   #8a9a97;
  --copper:      #b4622d;
  --copper-soft: #f0dccf;
  --clay:        #a63d3d;
  --amber:       #8a6a17;
  --teal:        #1d6b63;
  --shadow:      0 1px 2px rgba(22,33,31,.06), 0 8px 24px -12px rgba(22,33,31,.18);
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground:      #0e1514;
    --panel:       #151e1d;
    --panel-2:     #1b2625;
    --rule:        #2a3836;
    --ink:         #dde5e3;
    --ink-soft:    #92a5a2;
    --ink-faint:   #647773;
    --copper:      #e0854a;
    --copper-soft: #3a2617;
    --clay:        #e07070;
    --amber:       #d6ac48;
    --teal:        #4fb3a6;
    --shadow:      0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.6);
  }
}
:root[data-theme="dark"] {
  --ground:#0e1514; --panel:#151e1d; --panel-2:#1b2625; --rule:#2a3836;
  --ink:#dde5e3; --ink-soft:#92a5a2; --ink-faint:#647773;
  --copper:#e0854a; --copper-soft:#3a2617; --clay:#e07070; --amber:#d6ac48; --teal:#4fb3a6;
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.6);
}
:root[data-theme="light"] {
  --ground:#f4f6f6; --panel:#ffffff; --panel-2:#eaeeee; --rule:#d3dada;
  --ink:#16211f; --ink-soft:#5a6b68; --ink-faint:#8a9a97;
  --copper:#b4622d; --copper-soft:#f0dccf; --clay:#a63d3d; --amber:#8a6a17; --teal:#1d6b63;
  --shadow: 0 1px 2px rgba(22,33,31,.06), 0 8px 24px -12px rgba(22,33,31,.18);
}

* { box-sizing: border-box; }
body {
  margin: 0; background: var(--ground); color: var(--ink);
  font: 400 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
code, .mono, .id { font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace; }
.id { font-size: 13px; letter-spacing: -.01em; }
.num { font-variant-numeric: tabular-nums; }

/* ---------- masthead ---------- */
header {
  border-bottom: 1px solid var(--rule); background: var(--panel);
  padding: 20px 28px; display: flex; align-items: baseline; gap: 20px; flex-wrap: wrap;
}
h1 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
h1 span { color: var(--ink-faint); font-weight: 400; }
.stats { margin-left: auto; display: flex; gap: 18px; }
.stat { display: flex; align-items: baseline; gap: 6px; font-size: 13px; color: var(--ink-soft); }
.stat b { font-size: 17px; font-weight: 600; color: var(--ink); }
.stat.bad b { color: var(--clay); }
.stat.warn b { color: var(--amber); }

/* ---------- layer stack (the one global view) ---------- */
.stack { padding: 22px 28px; border-bottom: 1px solid var(--rule); }
.stack h2, .col h2 {
  margin: 0 0 12px; font-size: 11px; font-weight: 600; letter-spacing: .09em;
  text-transform: uppercase; color: var(--ink-faint);
}
.tiers { display: flex; gap: 26px; flex-wrap: wrap; }
.tier { flex: 1 1 300px; min-width: 280px; }
.tier > h3 {
  margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--ink-soft);
  letter-spacing: .04em; text-transform: uppercase;
}
.rung {
  display: flex; align-items: center; gap: 10px; padding: 5px 0;
  border-top: 1px solid var(--rule);
}
.rung:first-of-type { border-top: 0; }
.rung-name {
  width: 108px; flex: none; font-size: 11px; font-weight: 600;
  letter-spacing: .05em; text-transform: uppercase; color: var(--ink-soft);
}
.rung-mods { display: flex; gap: 5px; flex-wrap: wrap; }

/* depth ramp: deeper (more fundamental) = cooler + quieter */
.chip {
  font-family: ui-monospace, Menlo, monospace; font-size: 11.5px;
  padding: 3px 8px; border-radius: 3px; cursor: pointer;
  border: 1px solid var(--rule); background: var(--panel-2); color: var(--ink-soft);
  transition: background .12s, color .12s, border-color .12s;
}
.chip:hover { border-color: var(--copper); color: var(--copper); }
.chip:focus-visible { outline: 2px solid var(--copper); outline-offset: 1px; }
.chip.on { background: var(--copper); border-color: var(--copper); color: #fff; }
.chip .bad { color: var(--clay); font-weight: 700; }
.chip.on .bad { color: #ffe0d5; }

/* ---------- body: list | card ---------- */
main { display: grid; grid-template-columns: 300px 1fr; align-items: start; }
@media (max-width: 900px) { main { grid-template-columns: 1fr; } }

.col { border-right: 1px solid var(--rule); padding: 22px 20px; }
.col.list { position: sticky; top: 0; max-height: 100vh; overflow-y: auto; }
@media (max-width: 900px) { .col.list { position: static; max-height: none; border-right: 0; border-bottom: 1px solid var(--rule); } }

.grp { margin-bottom: 16px; }
.grp > h3 {
  margin: 0 0 4px; font-size: 10px; font-weight: 700; letter-spacing: .1em;
  text-transform: uppercase; color: var(--ink-faint);
}
.row {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 4px 7px; border: 0; border-radius: 4px; background: none;
  color: var(--ink-soft); cursor: pointer; font: inherit;
}
.row:hover { background: var(--panel-2); color: var(--ink); }
.row:focus-visible { outline: 2px solid var(--copper); outline-offset: -2px; }
.row.on { background: var(--copper-soft); color: var(--copper); }
.row .id { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { width: 34px; height: 3px; flex: none; border-radius: 2px; background: var(--rule); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--teal); }
.row .flag { color: var(--clay); font-size: 11px; font-weight: 700; }

/* ---------- the card ---------- */
.card { padding: 26px 30px 60px; max-width: 860px; }
.card-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.card-head h2 {
  margin: 0; font-family: ui-monospace, Menlo, monospace; font-size: 20px;
  font-weight: 600; letter-spacing: -.02em; color: var(--ink); text-transform: none;
}
.tag {
  font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
  padding: 3px 7px; border-radius: 3px; background: var(--panel-2);
  color: var(--ink-soft); border: 1px solid var(--rule);
}
.tag.lang { color: var(--teal); }
.meta { margin: 3px 0 0; font-size: 12.5px; color: var(--ink-faint); }
.intent {
  margin: 16px 0 0; padding: 14px 16px; border-left: 2px solid var(--teal);
  background: var(--panel); border-radius: 0 5px 5px 0; box-shadow: var(--shadow);
  max-width: 68ch; color: var(--ink);
}
.intent.todo { border-left-color: var(--amber); color: var(--ink-soft); font-style: italic; }

section.blk { margin-top: 26px; }
section.blk > h3 {
  margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: .09em;
  text-transform: uppercase; color: var(--ink-faint);
  display: flex; align-items: center; gap: 8px;
}
section.blk > h3 .n { color: var(--ink); font-weight: 600; }
.arrow { color: var(--copper); font-weight: 700; }

.surface { display: flex; flex-wrap: wrap; gap: 6px; }
.sym {
  font-family: ui-monospace, Menlo, monospace; font-size: 12px;
  padding: 3px 8px; border-radius: 3px; border: 1px solid var(--rule);
  background: var(--panel); color: var(--ink);
}
.sym.cls { border-color: var(--teal); color: var(--teal); font-weight: 600; }

.viol {
  display: flex; align-items: center; gap: 8px; padding: 7px 10px; margin-bottom: 4px;
  border-radius: 4px; background: var(--panel); border: 1px solid var(--rule);
  border-left: 3px solid var(--clay); font-size: 12.5px;
}
.viol.cyc { border-left-color: var(--amber); }
.viol .id { color: var(--ink); }
.viol .why { color: var(--ink-faint); margin-left: auto; font-size: 11.5px; }

details.files { margin-top: 8px; }
details.files > summary {
  cursor: pointer; font-size: 12.5px; color: var(--ink-soft);
  padding: 6px 0; list-style: none; user-select: none;
}
details.files > summary::-webkit-details-marker { display: none; }
details.files > summary::before { content: "▸ "; color: var(--copper); }
details.files[open] > summary::before { content: "▾ "; }
details.files > summary:hover { color: var(--copper); }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
td { padding: 5px 10px 5px 0; border-top: 1px solid var(--rule); vertical-align: top; }
td.f { font-family: ui-monospace, Menlo, monospace; white-space: nowrap; color: var(--ink); }
td.l { text-align: right; color: var(--ink-faint); width: 60px; }
td.e { color: var(--ink-soft); font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; }
.scroll { overflow-x: auto; }
.empty { color: var(--ink-faint); font-size: 13px; font-style: italic; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>"""

BODY = """
<header>
  <h1>PangyPlot <span>/ module map</span></h1>
  <div class="stats">
    <div class="stat"><b class="num" id="s-mod">0</b> modules</div>
    <div class="stat"><b class="num" id="s-loc">0</b> lines</div>
    <div class="stat warn"><b class="num" id="s-cyc">0</b> cycles</div>
    <div class="stat bad"><b class="num" id="s-viol">0</b> upward imports</div>
  </div>
</header>

<div class="stack">
  <h2>Layer stack &mdash; imports may go sideways or down, never up</h2>
  <div class="tiers" id="tiers"></div>
</div>

<main>
  <div class="col list"><h2>Modules</h2><div id="list"></div></div>
  <div class="card" id="card"></div>
</main>

<script>
const DATA = __DATA__;
const M = DATA.modules, BY = Object.fromEntries(M.map(m => [m.name, m]));

const RANK = {shared:0, domain:1, storage:2, index:3, query:4, app:5, cli:6, preprocess:5,
  "ui-kit":1, "viewer-core":2, "viewer-skeleton":3, "viewer-detail":3, "ui-sections":3,
  "viewer-engines":4, "viewer-entry":5, debug:9};
const TIERS = {
  "Backend": ["cli","app","preprocess","query","index","storage","domain"],
  "Frontend": ["viewer-entry","viewer-engines","ui-sections","viewer-detail","viewer-skeleton","viewer-core","ui-kit"],
  "Shared &amp; tooling": ["shared","debug","unassigned"]
};

const short = n => n.replace("pangyplot/static/js/","js/").replace(/^pangyplot\\//,"").replace(/^pangyplot$/,"· root");
const outCount = m => DATA.violations.filter(v => v.from === m).length;
const maxLoc = Math.max(...M.map(m => m.loc));

document.getElementById("s-mod").textContent = M.length;
document.getElementById("s-loc").textContent = M.reduce((a,m)=>a+m.loc,0).toLocaleString();
document.getElementById("s-cyc").textContent = DATA.cycles.length;
document.getElementById("s-viol").textContent = DATA.violations.length;

// ---- layer stack
const tiers = document.getElementById("tiers");
for (const [title, layers] of Object.entries(TIERS)) {
  const box = document.createElement("div");
  box.className = "tier";
  box.innerHTML = `<h3>${title}</h3>`;
  for (const layer of layers) {
    const mods = M.filter(m => m.layer === layer);
    if (!mods.length) continue;
    const rung = document.createElement("div");
    rung.className = "rung";
    rung.innerHTML = `<div class="rung-name">${layer}</div>`;
    const wrap = document.createElement("div");
    wrap.className = "rung-mods";
    for (const m of mods.sort((a,b)=>b.loc-a.loc)) {
      const b = document.createElement("button");
      b.className = "chip"; b.dataset.mod = m.name;
      const n = outCount(m.name);
      b.innerHTML = short(m.name) + (n ? ` <span class="bad">${n}↑</span>` : "");
      b.onclick = () => show(m.name);
      wrap.appendChild(b);
    }
    rung.appendChild(wrap);
    box.appendChild(rung);
  }
  tiers.appendChild(box);
}

// ---- module list
const list = document.getElementById("list");
for (const [title, layers] of Object.entries(TIERS)) {
  const mods = M.filter(m => layers.includes(m.layer)).sort((a,b)=>a.name.localeCompare(b.name));
  if (!mods.length) continue;
  const g = document.createElement("div");
  g.className = "grp";
  g.innerHTML = `<h3>${title}</h3>`;
  for (const m of mods) {
    const b = document.createElement("button");
    b.className = "row"; b.dataset.mod = m.name;
    const n = outCount(m.name);
    b.innerHTML = `<span class="id">${short(m.name)}</span>` +
      (n ? `<span class="flag">${n}↑</span>` : "") +
      `<span class="bar"><i style="width:${Math.round(100*m.loc/maxLoc)}%"></i></span>`;
    b.onclick = () => show(m.name);
    g.appendChild(b);
  }
  list.appendChild(g);
}

// ---- the card
function chips(names, label) {
  if (!names.length) return `<p class="empty">none</p>`;
  return `<div class="surface">` + names.map(n =>
    `<button class="chip" onclick="show('${n}')">${short(n)}</button>`).join("") + `</div>`;
}

function show(name) {
  const m = BY[name];
  if (!m) return;
  for (const el of document.querySelectorAll("[data-mod]"))
    el.classList.toggle("on", el.dataset.mod === name);

  const ups = DATA.violations.filter(v => v.from === name);
  const cycs = DATA.cycles.filter(c => c.includes(name)).map(c => c[0] === name ? c[1] : c[0]);
  const classes = m.public.filter(p => p.kind === "class");
  const funcs = m.public.filter(p => p.kind !== "class");

  document.getElementById("card").innerHTML = `
    <div class="card-head">
      <h2>${short(m.name)}</h2>
      <span class="tag">${m.layer}</span>
      <span class="tag lang">${m.lang}</span>
    </div>
    <p class="meta num">${m.files.length} files · ${m.loc.toLocaleString()} lines · ${m.functions} functions · ${m.public.length} exported</p>

    <p class="intent${m.intent ? "" : " todo"}">${m.intent || "No intent recorded. Add one in tools/architecture.yaml — this is the part the code cannot tell you."}</p>

    ${m.entrypoints.length ? `<section class="blk"><h3>Entry point</h3>
      <div class="surface">${m.entrypoints.map(e=>`<span class="sym">${e}</span>`).join("")}</div>
      </section>` : ""}

    <section class="blk">
      <h3>Public surface <span class="n num">${m.public.length}</span></h3>
      ${m.public.length ? `<div class="surface">` +
        classes.map(p=>`<span class="sym cls" title="${p.file}">${p.name}</span>`).join("") +
        funcs.map(p=>`<span class="sym" title="${p.file}">${p.name}()</span>`).join("") +
        `</div>` : `<p class="empty">nothing exported — side-effect module, run for its wiring</p>`}
    </section>

    <section class="blk">
      <h3><span class="arrow">&larr;</span> Used by <span class="n num">${m.used_by.length}</span></h3>
      ${chips(m.used_by)}
    </section>

    <section class="blk">
      <h3><span class="arrow">&rarr;</span> Uses <span class="n num">${m.uses.length}</span></h3>
      ${chips(m.uses)}
    </section>

    ${(ups.length || cycs.length) ? `<section class="blk">
      <h3>Boundary notes</h3>
      ${ups.map(v=>`<div class="viol"><span class="id">${short(v.to)}</span>
        <span class="why">imports upward: ${v.from_layer} &rarr; ${v.to_layer}</span></div>`).join("")}
      ${cycs.map(c=>`<div class="viol cyc"><span class="id">${short(c)}</span>
        <span class="why">import cycle</span></div>`).join("")}
    </section>` : ""}

    <section class="blk">
      <h3>Files</h3>
      <details class="files">
        <summary>${m.files.length} files, ${m.functions} functions</summary>
        <div class="scroll"><table>
          ${m.files.map(f=>`<tr>
            <td class="f">${f.name}</td>
            <td class="l num">${f.loc}</td>
            <td class="e">${f.exports.join(" ") || "—"}</td></tr>`).join("")}
        </table></div>
      </details>
    </section>
  `;
  document.getElementById("card").scrollIntoView({block:"nearest"});
}

show("pangyplot/db");
</script>
"""


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    html = HEAD + BODY.replace("__DATA__", json.dumps(data))
    open(DEST, "w", encoding="utf-8").write(html)
    print(f"-> {DEST}")


if __name__ == "__main__":
    main()
