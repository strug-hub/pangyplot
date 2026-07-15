"""Atlas core — the renderer every flow page shares.

A *flow* is one journey through the codebase in the order it actually happens:
`pangyplot add`, a `/select` request, a bubble pop. Each flow lives in
tools/atlas/flows/<slug>.py and is pure spec — stages, functions, panels, and a
`contexts()` that measures the flow against something real. Everything else
(resolving functions to line numbers, pulling docstrings, running the mapped
tests, scanning TODOs, drawing the page) lives here and is written once.

The flow contract, in full:

    SLUG      str                 # output filename, tools/atlas/<SLUG>.html
    TITLE     str                 # HTML, the h1
    SUB       str                 # one paragraph under it
    CTX_LABEL str                 # what the switcher picks between ("dataset", "route")
    STAGES    list[stage]         # the flow, in order
    PANELS    list[panel]         # free-standing prose at the foot of the page
    contexts() -> {label: ctx}    # measured, at build time

    stage = {
      "id": str, "name": str,
      "timing_key": str|None,     # key into ctx["timings"]
      "fns": [(path, symbol)],    # NEVER a line number -- resolved by AST each build
      "gist": str,                # fallback only; the docstring wins if there is one
      "inp": str, "out": str,     # optional
      "artifacts": [(name, kind, note)],
      "checks": [str],            # keys into ctx["probe"]
      "tests": [str],             # test file paths
      "notes": [(title, html)],   # hazards -- something is WRONG (red)
      "invariants": [(title, html)],  # something is RIGHT and fragile (teal)
      "sub": [step],              # ordered substeps; each is a stage-shaped dict
      "flag": bool, "hang": bool, # optional badges
    }

    ctx = {"line": html, "timings": {key: {"s": float, "gb": float|None}},
           "probe": {key: {"ok": bool, "detail": str, "weak": bool}},
           "artifacts": {name: [present, size_str]}}

Every field is optional except id/name/fns. Nothing here reaches into a flow.
"""

import ast
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, "tools", "atlas")
sys.path.insert(0, ROOT)


def esc(s):
    return (str(s) if s is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def git_sha():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                              capture_output=True, text=True).stdout.strip()
    except Exception:
        return "?"


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


# ---------------------------------------------------------------------------
# Resolving a spec entry to real code
# ---------------------------------------------------------------------------

def resolve(path, symbol):
    """Locate `symbol` in `path` and return its line and first docstring line.

    Line numbers are NEVER authored in a flow spec -- they rot silently the moment
    anyone edits above them, and a stale vscode:// link still opens *a* line, so
    nobody notices. Resolve from the symbol every build instead.

    Python is parsed with `ast`. JavaScript has no parser here, so it is matched
    with a small set of declaration patterns; a JS symbol that cannot be found is
    reported as an error rather than silently linking to line 1.
    """
    want = symbol.split(".")[-1]
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        return {"path": path, "symbol": symbol, "line": 1, "doc": None,
                "error": "file not found"}

    if path.endswith(".py"):
        try:
            tree = ast.parse(open(full, encoding="utf-8").read())
        except SyntaxError as e:
            return {"path": path, "symbol": symbol, "line": 1, "doc": None,
                    "error": f"unparseable: {e}"}
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) \
                    and node.name == want:
                doc = ast.get_docstring(node)
                first = doc.strip().split("\n")[0].strip() if doc else None
                return {"path": path, "symbol": symbol, "line": node.lineno,
                        "doc": first, "error": None}
        return {"path": path, "symbol": symbol, "line": 1, "doc": None,
                "error": "symbol not found"}

    return resolve_js(path, full, symbol, want)


JS_DECL = [
    r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*{w}\s*\(",
    r"^\s*(?:export\s+)?(?:const|let|var)\s+{w}\s*=\s*(?:async\s*)?(?:function|\()",
    r"^\s*(?:export\s+)?class\s+{w}\b",
    r"^\s*(?:static\s+|async\s+|get\s+|set\s+)*{w}\s*\([^)]*\)\s*\{",  # class method
    r"^\s*(?:export\s+)?(?:const|let|var)\s+{w}\s*=\s*[^=]*=>",        # arrow fn
]


def resolve_js(path, full, symbol, want):
    """Find a JS function/class/method by declaration pattern, plus its JSDoc.

    There is no JS parser in this toolchain, so this matches declaration forms
    rather than parsing. It is deliberately strict: an unmatched symbol is an
    error, never a silent link to the top of the file.
    """
    lines = open(full, encoding="utf-8", errors="replace").read().split("\n")
    pats = [re.compile(p.replace("{w}", re.escape(want))) for p in JS_DECL]
    for i, line in enumerate(lines):
        if any(p.match(line) for p in pats):
            doc = None
            j = i - 1
            while j >= 0 and lines[j].strip().startswith(("*", "*/", "//")):
                t = lines[j].strip().lstrip("/*").lstrip("*").strip()
                # A banner rule ("// -----") is decoration, not an explanation.
                if t and not t.startswith("/") and t.strip("-=~_ "):
                    doc = t
                j -= 1
            return {"path": path, "symbol": symbol, "line": i + 1, "doc": doc,
                    "error": None}
    return {"path": path, "symbol": symbol, "line": 1, "doc": None,
            "error": "symbol not found"}


def resolve_step(step):
    """Attach resolved functions + the explanation to a step.

    The explanation comes from the function's own docstring where there is one --
    the code is the source of truth, and it cannot drift from itself. An authored
    `gist` only wins when the step spans several functions, because no single
    docstring can describe a composition.
    """
    fns = [resolve(p, s) for p, s in step.get("fns", [])]
    authored = step.get("gist")
    if len(fns) > 1:
        text, src = authored, "composed"
    elif fns and fns[0]["doc"]:
        text, src = fns[0]["doc"], "docstring"
    elif authored:
        text, src = authored, "atlas-only"
    else:
        text, src = None, "missing"
    return {"fns": fns, "text": text, "src": src}


def fnlines(fns):
    out = []
    for f in fns:
        abs_path = os.path.join(ROOT, f["path"])
        bad = ' style="color:var(--clay)"' if f["error"] else ""
        out.append(
            f'<a href="vscode://file/{abs_path}:{f["line"]}"{bad} '
            f'title="open {esc(f["path"])}:{f["line"]}">{esc(f["symbol"])}()</a>'
            f' — {esc(f["path"])}:{f["line"]}'
            + (f' <b style="color:var(--clay)">{f["error"]}</b>' if f["error"] else "")
        )
    return "<br>".join(out) or '<span class="faint">no function bound to this step</span>'


PROV = {
    "docstring": '<p class="prov">↑ the function\'s own docstring</p>',
    "composed": '<p class="prov">↑ written here — this step spans several functions,'
                ' so no single docstring covers it</p>',
    "atlas-only": '<p class="undoc">This explanation lives only in the atlas —'
                  ' the function has no docstring. Write one and it will be used instead.</p>',
}


def step_block(name, step, cost=None):
    """One step: its name, its function(s) in grey underneath, then one plain sentence."""
    r = resolve_step(step)
    if r["text"]:
        body = f'<p>{esc(r["text"])}</p>' + PROV.get(r["src"], "")
    else:
        body = ('<p class="undoc">No docstring, and nothing written here either. '
                'This step is unexplained.</p>')
    return (
        f'<div class="step"><h5>{esc(name)}</h5>'
        f'<p class="fnline">{fnlines(r["fns"])}</p>'
        f'{body}'
        + (f'<p class="warnp">{esc(cost)}</p>' if cost else "")
        + "</div>"
    )


def punch_list(stages):
    """Every step function with no docstring — the code's own missing explanations."""
    out = []
    for st in stages:
        for step in [st] + list(st.get("sub") or []):
            for p, s in step.get("fns", []):
                f = resolve(p, s)
                if f["error"]:
                    out.append((st["name"], step["name"], f, "UNRESOLVED"))
                elif not f["doc"]:
                    out.append((st["name"], step["name"], f, "no docstring"))
    return out


# ---------------------------------------------------------------------------
# Tests and TODOs -- both derived from the files the flow actually touches
# ---------------------------------------------------------------------------

def stage_files(st):
    return list(dict.fromkeys(
        [p for p, _ in st.get("fns", [])]
        + [p for s in (st.get("sub") or []) for p, _ in s.get("fns", [])]
    ))


TODO_RX = re.compile(r"(?:#|//)\s*(TODO|FIXME|HACK|XXX)\b[:\s]*(.*)")


def scan_todos(stages):
    """TODO/FIXME/HACK/XXX markers in the files each stage actually touches."""
    per = {}
    for st in stages:
        hits = []
        for f in stage_files(st):
            p = os.path.join(ROOT, f)
            if not os.path.exists(p):
                continue
            for i, line in enumerate(open(p, encoding="utf-8", errors="replace"), 1):
                m = TODO_RX.search(line)
                if m:
                    hits.append({"file": f, "line": i, "kind": m.group(1),
                                 "text": m.group(2).strip() or "(no description)"})
        per[st["id"]] = hits
    return per


def run_tests(slug, stages):
    """Actually run the tests each stage claims to cover it. Unrun tests are decoration.

    pytest and vitest are both dispatched from here; a stage's test list may mix
    them. Results are grouped per file and cached to tools/atlas/tests.<slug>.json.
    """
    files = sorted({t for st in stages for t in st.get("tests", [])})
    py = [f for f in files if f.endswith(".py")]
    js = [f for f in files if not f.endswith(".py")]
    per, err = {}, None

    if py:
        xml = os.path.join(HERE, f".junit.{slug}.xml")
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", *py, "-q", "--tb=no", f"--junitxml={xml}"],
            cwd=ROOT, capture_output=True, text=True)
        if not os.path.exists(xml):
            err = (proc.stdout + proc.stderr)[-800:]
        else:
            for tc in ET.parse(xml).getroot().iter("testcase"):
                f = tc.attrib.get("file") or (tc.attrib["classname"].replace(".", "/") + ".py")
                if not os.path.exists(os.path.join(ROOT, f)):
                    parts = tc.attrib["classname"].split(".")
                    while parts and not os.path.exists(os.path.join(ROOT, "/".join(parts) + ".py")):
                        parts.pop()
                    f = "/".join(parts) + ".py" if parts else f
                d = per.setdefault(f, {"passed": 0, "failed": 0, "skipped": 0,
                                       "time": 0.0, "fails": []})
                d["time"] += float(tc.attrib.get("time", 0))
                if tc.find("failure") is not None or tc.find("error") is not None:
                    d["failed"] += 1
                    d["fails"].append(tc.attrib["name"])
                elif tc.find("skipped") is not None:
                    d["skipped"] += 1
                else:
                    d["passed"] += 1
            os.remove(xml)

    if js:
        per.update(run_vitest(js))

    out = {"files": per, "error": err}
    json.dump(out, open(os.path.join(HERE, f"tests.{slug}.json"), "w"), indent=1)
    return out


def run_vitest(files):
    """Run the frontend tests a flow maps to, via vitest's JSON reporter."""
    rep = os.path.join(HERE, ".vitest.json")
    subprocess.run(["npx", "vitest", "run", *files, "--reporter=json",
                    f"--outputFile={rep}"],
                   cwd=ROOT, capture_output=True, text=True)
    if not os.path.exists(rep):
        return {f: {"passed": 0, "failed": 0, "skipped": 0, "time": 0.0,
                    "fails": ["vitest produced no report"]} for f in files}
    data = json.load(open(rep))
    os.remove(rep)
    per = {}
    for res in data.get("testResults", []):
        f = os.path.relpath(res.get("name", ""), ROOT)
        d = per.setdefault(f, {"passed": 0, "failed": 0, "skipped": 0,
                               "time": 0.0, "fails": []})
        for a in res.get("assertionResults", []):
            if a["status"] == "passed":
                d["passed"] += 1
            elif a["status"] == "failed":
                d["failed"] += 1
                d["fails"].append(a["title"])
            else:
                d["skipped"] += 1
            d["time"] += (a.get("duration") or 0) / 1000
    return per


def load_tests(slug, stages, rerun):
    cache = os.path.join(HERE, f"tests.{slug}.json")
    if not rerun and os.path.exists(cache):
        return json.load(open(cache))
    if not any(st.get("tests") for st in stages):
        return {"files": {}, "error": None}
    return run_tests(slug, stages)


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------

def stage_html(st):
    cls = "stage" + (" hot" if st.get("flag") else "") + (" hang" if st.get("hang") else "")
    badges = ""
    if st.get("flag"):
        badges += '<span class="badge hot">memory hotspot</span>'
    if st.get("hang"):
        badges += '<span class="badge hang">hang candidate</span>'

    sub = st.get("sub") or []
    io = ""
    if st.get("inp"):
        io = (f'<p class="io"><b>in</b>{esc(st["inp"])}</p>'
              f'<p class="io"><b>out</b>{esc(st.get("out"))}</p>')

    steps = "".join(step_block(s["name"], s, s.get("cost")) for s in sub) \
        if sub else step_block(st["name"], st)

    arts = ""
    if st.get("artifacts"):
        chips = "".join(
            f'<span class="chip" data-art="{esc(n)}">'
            f'<span class="nm">{esc(n)}</span><span class="kind">{esc(k)}</span>'
            f'<span class="sz"></span></span>'
            for n, k, _ in st["artifacts"])
        arts = f'<h4 style="margin-top:18px">Writes</h4><div class="arts">{chips}</div>'

    pane_what = (
        f'<div class="pane" data-pane="what">'
        f'<h4>What happens — {len(sub) or 1} step{"s" if len(sub) != 1 else ""}, in order</h4>'
        f'{io}<div style="margin-top:12px">{steps}</div>{arts}</div>')

    if sub:
        rows = "".join(
            f'<tr data-sub="{esc(s.get("timing_key") or "")}" '
            f'data-alt="{esc(s.get("alt_timing_key") or "")}">'
            f'<td class="sn">{esc(s["name"])}'
            f'<p class="fnline">{fnlines(resolve_step(s)["fns"])}</p></td>'
            f'<td class="sg">{esc(resolve_step(s)["text"] or "no docstring")}'
            + (f'<span class="scost">{esc(s["cost"])}</span>' if s.get("cost") else "")
            + f'</td><td class="sb"><div class="bar"><i style="width:0"></i></div></td>'
            f'<td class="stm">—</td></tr>'
            for s in sub)
        perf_body = f'<table class="sub">{rows}</table>'
    else:
        perf_body = '<p class="hint">Single step — no sub-timings recorded.</p>'
    pane_perf = (f'<div class="pane" data-pane="perf"><h4>Performance</h4>'
                 f'<p data-perfhead style="margin:0 0 12px;font-size:13px;color:var(--soft)"></p>'
                 f'{perf_body}</div>')

    tests = st.get("tests") or []
    tf = "".join(f'<div class="tf" data-tf="{esc(t)}"></div>' for t in tests)
    py = [t for t in tests if t.endswith(".py")]
    js = [t for t in tests if not t.endswith(".py")]
    cmd = ""
    if py:
        cmd += "python -m pytest " + " ".join(py)
    if js:
        cmd += ("<br>$ <b>" if py else "") + "npx vitest run " + " ".join(js) + ("</b>" if py else "")
    pane_tests = ('<div class="pane" data-pane="tests"><h4>Tests</h4>' + tf
                  + (f'<div class="cmd">$ <b>{cmd}</b></div>' if cmd else
                     '<p class="hint">No tests mapped to this stage.</p>')
                  + "</div>")

    checks = st.get("checks") or []
    if checks:
        cks = "".join(f'<div class="ck" data-ck="{esc(c)}"></div>' for c in checks)
        ck_body = (f'<div class="cks">{cks}</div>'
                   '<p class="hint">Probed live, at build time.</p>')
    else:
        ck_body = '<p class="hint">Nothing durable is written here, so there is nothing to check.</p>'
    pane_ck = f'<div class="pane" data-pane="check"><h4>Checkpoints</h4>{ck_body}</div>'

    notes = st.get("notes") or []
    hz = "".join(f'<div class="note"><h4>{esc(t)}</h4><p>{b}</p></div>' for t, b in notes) \
        or '<p class="hint">Nothing known to be wrong here.</p>'
    pane_hz = f'<div class="pane" data-pane="haz"><h4>Hazards — things that are wrong</h4>{hz}</div>'

    inv = st.get("invariants") or []
    ib = "".join(f'<div class="inv"><h4>{esc(t)}</h4><p>{b}</p></div>' for t, b in inv) \
        or '<p class="hint">No load-bearing assumptions recorded here.</p>'
    pane_inv = ('<div class="pane" data-pane="inv">'
                '<h4>Invariants — things that are right, and fragile</h4>'
                '<p class="hint" style="margin:0 0 12px">Not problems. Reasons, for anyone '
                f'(human or agent) about to change this code.</p>{ib}</div>')

    pane_todo = ('<div class="pane" data-pane="todo"><h4>TODOs in these files</h4>'
                 '<div data-todos></div></div>')

    strip = f"""<div class="strip">
  <button class="facet" data-f="what"><span class="lt"></span>what happens<span class="caret">▸</span></button>
  <button class="facet" data-f="perf"><span class="lt"></span>performance<span class="cnt" data-perfcnt>—</span><span class="caret">▸</span></button>
  <button class="facet" data-f="tests"><span class="lt"></span>tests<span class="cnt" data-testcnt>—</span><span class="caret">▸</span></button>
  <button class="facet" data-f="check"><span class="lt"></span>checkpoints<span class="cnt" data-ckcnt>—</span><span class="caret">▸</span></button>
  {'<button class="facet bad" data-f="haz"><span class="lt"></span>hazards<span class="cnt">' + str(len(notes)) + '</span><span class="caret">▸</span></button>' if notes else ''}
  {'<button class="facet keep" data-f="inv"><span class="lt"></span>invariants<span class="cnt">' + str(len(inv)) + '</span><span class="caret">▸</span></button>' if inv else ''}
  <button class="facet" data-f="todo" data-todofacet><span class="lt"></span>todos<span class="cnt" data-todocnt>0</span><span class="caret">▸</span></button>
</div>"""

    return f"""
<div class="{cls}" data-stage="{esc(st['id'])}" data-timing="{esc(st.get('timing_key') or '')}">
  <div class="rail"><div class="dot"></div></div>
  <div class="card">
    <div class="st-hd"><h2>{esc(st['name'])}</h2>{badges}
      <span class="time none" data-time>—</span></div>
    <p class="st-fn">{fnlines([resolve(*f) for f in st.get('fns', [])])}</p>
    <p class="gist">{esc(st.get('gist'))}</p>
    {strip}{pane_what}{pane_perf}{pane_tests}{pane_ck}{pane_hz}{pane_inv}{pane_todo}
  </div>
</div>"""


def panel_html(p):
    cls, title, paras = p["cls"], p["title"], p["paras"]
    body = "".join(
        (f"<p><b>{esc(lbl)}</b> {txt}</p>" if lbl else f"<p>{txt}</p>")
        for lbl, txt in paras)
    return f'<div class="panel {cls}"><h3>{title}</h3>{body}</div>'


def render(flow, contexts, tests):
    stages = flow.STAGES
    nav = "".join(
        f'<a href="{s}.html"{" class=on" if s == flow.SLUG else ""}>{n}</a>'
        for s, n in FLOWS)
    body = "".join(stage_html(st) for st in stages)
    panels = "".join(panel_html(p) for p in getattr(flow, "PANELS", []))
    css = open(os.path.join(HERE, "atlas.css"), encoding="utf-8").read()

    return f"""<title>Atlas — {esc(flow.NAME)}</title>
<style>{css}</style>
<header><div class="hd">
  <nav class="flows">{nav}</nav>
  <h1>{flow.TITLE}</h1>
  <p class="sub">{flow.SUB}</p>
  <div class="ds"><b>{esc(flow.CTX_LABEL)}</b><span id="dsbtns"></span></div>
  <p class="runbar" id="runbar"></p>
</div></header>
<div class="wrap">{body}{panels}
<p class="foot">built from <code>{git_sha()}</code> · every function link resolved by AST at build time ·
<code>python tools/atlas/build.py {flow.SLUG}</code></p>
</div>

<script>
const DS = {json.dumps(contexts)};
const TESTS = {json.dumps(tests)};
const TODOS = {json.dumps(scan_todos(stages))};
const STAGE_TESTS = {json.dumps({st["id"]: st.get("tests", []) for st in stages})};
const STAGE_CHECKS = {json.dumps({st["id"]: st.get("checks", []) for st in stages})};
const ROOT = {json.dumps(ROOT)};
const names = Object.keys(DS);
let cur = names[0];

const btns = document.getElementById("dsbtns");
for (const n of names) {{
  const b = document.createElement("button");
  b.textContent = n; b.onclick = () => paint(n);
  b.dataset.ds = n; btns.appendChild(b);
}}
if (!names.length) btns.innerHTML = '<span class="hint">nothing to measure against</span>';

const fmt = s => s == null ? "—"
  : s < 1  ? s.toFixed(2) + "s"
  : s < 60 ? s.toFixed(1) + "s"
  : Math.floor(s / 60) + "m" + String(Math.round(s % 60)).padStart(2, "0") + "s";

for (const f of document.querySelectorAll(".facet")) {{
  f.onclick = () => {{
    const card = f.closest(".card"), want = f.dataset.f;
    const isOpen = f.classList.contains("on");
    card.querySelectorAll(".facet").forEach(x => x.classList.remove("on"));
    card.querySelectorAll(".pane").forEach(p => p.classList.remove("open"));
    if (!isOpen) {{
      f.classList.add("on");
      card.querySelector(`.pane[data-pane="${{want}}"]`).classList.add("open");
    }}
  }};
}}

for (const el of document.querySelectorAll(".stage")) {{
  const hits = TODOS[el.dataset.stage] || [];
  const box = el.querySelector("[data-todos]");
  el.querySelector("[data-todocnt]").textContent = hits.length || "0";
  if (!hits.length) {{
    box.innerHTML = `<p class="hint">No TODO, FIXME, HACK or XXX markers in the files this stage touches.</p>`;
  }} else {{
    el.querySelector("[data-todofacet]").classList.add("warn");
    box.innerHTML = hits.map(h =>
      `<div class="todo"><span class="k">${{h.kind}}</span><span class="t">${{h.text}}</span>`
      + `<a class="w" href="vscode://file/${{ROOT}}/${{h.file}}:${{h.line}}">${{h.file}}:${{h.line}}</a></div>`
    ).join("");
  }}
}}

for (const el of document.querySelectorAll(".stage")) {{
  const files = STAGE_TESTS[el.dataset.stage] || [];
  let pass = 0, fail = 0;
  for (const tf of el.querySelectorAll(".tf[data-tf]")) {{
    const r = TESTS.files[tf.dataset.tf];
    if (!r) {{
      tf.innerHTML = `<span class="nm">${{tf.dataset.tf}}</span><span class="res">not run</span>`;
      continue;
    }}
    pass += r.passed; fail += r.failed;
    const bad = r.failed > 0;
    tf.innerHTML =
      `<a class="nm" href="vscode://file/${{ROOT}}/${{tf.dataset.tf}}">${{tf.dataset.tf}}</a>`
      + `<span class="res ${{bad ? "f" : "p"}}">${{bad ? r.failed + " failed / " : ""}}${{r.passed}} passed</span>`
      + `<span class="ms">${{(r.time * 1000).toFixed(0)}}ms</span>`;
  }}
  const fc = el.querySelector('.facet[data-f="tests"]');
  const cnt = el.querySelector("[data-testcnt]");
  if (!files.length) {{ fc.classList.add("warn"); cnt.textContent = "none"; }}
  else if (fail) {{ fc.classList.add("bad"); cnt.textContent = `${{fail}} failed`; }}
  else {{ fc.classList.add("good"); cnt.textContent = `${{pass}} passed`; }}
}}

function paint(name) {{
  cur = name;
  const d = DS[name];
  if (!d) return;
  for (const b of btns.children) b.classList.toggle("on", b.dataset.ds === name);
  document.getElementById("runbar").innerHTML = d.line || "";

  const T = d.timings || {{}};
  for (const el of document.querySelectorAll(".stage")) {{
    const t = T[el.dataset.timing];
    const tm = el.querySelector("[data-time]");
    tm.textContent = t ? fmt(t.s) : "—";
    tm.className = t ? "time" : "time none";

    const pf = el.querySelector('.facet[data-f="perf"]');
    pf.classList.remove("good", "warn", "bad");
    const pc = el.querySelector("[data-perfcnt]");
    if (t) {{
      pf.classList.add("good"); pc.textContent = fmt(t.s);
      const share = (T.total || {{}}).s ? (100 * t.s / T.total.s).toFixed(0) : null;
      el.querySelector("[data-perfhead]").innerHTML =
        `<b>${{fmt(t.s)}}</b>` + (share ? ` — ${{share}}% of the run` : "")
        + (t.gb != null ? ` · peak <b>${{t.gb.toFixed(2)}} GB</b>` : "");
    }} else {{
      pf.classList.add("warn"); pc.textContent = "no data";
      el.querySelector("[data-perfhead]").innerHTML =
        `<span style="color:var(--amber)">No timing recorded here.</span>`;
    }}

    const subMax = Math.max(...[...el.querySelectorAll("tr[data-sub]")]
      .map(r => (T[r.dataset.sub] || T[r.dataset.alt] || {{}}).s || 0), 0.0001);
    for (const r of el.querySelectorAll("tr[data-sub]")) {{
      const st = T[r.dataset.sub] || T[r.dataset.alt];
      r.querySelector(".stm").textContent = st ? fmt(st.s) : "—";
      r.querySelector(".bar i").style.width = st ? (100 * st.s / subMax) + "%" : "0";
    }}

    for (const c of el.querySelectorAll(".chip[data-art]")) {{
      const a = (d.artifacts || {{}})[c.dataset.art];
      c.classList.toggle("gone", !a || !a[0]);
      c.querySelector(".sz").textContent = a && a[0] ? a[1] : "absent";
    }}

    const checks = STAGE_CHECKS[el.dataset.stage] || [];
    let ok = 0, bad = 0;
    for (const c of el.querySelectorAll(".ck[data-ck]")) {{
      const p = (d.probe || {{}})[c.dataset.ck];
      if (!p) {{ c.className = "ck"; c.innerHTML = `<span class="nm">${{c.dataset.ck}}</span><span class="dt">not probed</span>`; continue; }}
      p.ok ? ok++ : bad++;
      c.className = "ck " + (p.ok ? "pass" : "fail");
      c.innerHTML = `<span class="mark">${{p.ok ? "✓" : "✕"}}</span>`
        + `<span class="nm">${{c.dataset.ck}}</span>`
        + (p.weak && p.ok ? `<span class="weak">files exist — not content-checked</span>` : "")
        + `<span class="dt">${{p.detail}}</span>`;
    }}
    const cf = el.querySelector('.facet[data-f="check"]');
    cf.classList.remove("good", "warn", "bad");
    const cc = el.querySelector("[data-ckcnt]");
    if (!checks.length) {{ cc.textContent = "n/a"; }}
    else if (bad) {{ cf.classList.add("bad"); cc.textContent = `${{bad}} failing`; }}
    else {{ cf.classList.add("good"); cc.textContent = `${{ok}}/${{ok}}`; }}
  }}
}}
paint(cur);
</script>
"""


# The flow index. Order is the order a newcomer should read them in.
FLOWS = [
    ("ingest", "add"),
    ("startup", "run"),
    ("select", "/select"),
    ("pop", "pop"),
    ("path", "/path"),
    ("boot", "first paint"),
    ("lod", "LOD"),
    ("tick", "sim tick"),
]
