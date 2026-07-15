"""Atlas — build the flow pages.

    python tools/atlas/build.py              # every flow, cached tests
    python tools/atlas/build.py ingest --open
    python tools/atlas/build.py --tests      # re-run every mapped test first
    python tools/atlas/build.py --check      # CI: non-zero if any checkpoint fails

Each flow is one journey through the codebase, in tools/atlas/flows/. A flow is
pure spec; core.py renders it, resolves every function by AST, pulls the
explanations out of the docstrings, runs the mapped tests, and measures the flow
against something real.
"""

import argparse
import importlib
import os
import sys
import traceback
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import core
from core import ROOT, HERE, FLOWS, esc


def load(slug):
    return importlib.import_module(f"flows.{slug}")


def build(slug, rerun_tests):
    flow = load(slug)
    tests = core.load_tests(slug, flow.STAGES, rerun_tests)
    if tests.get("error"):
        print(f"  tests failed to run: {tests['error'][:200]}", file=sys.stderr)
    else:
        tp = sum(v["passed"] for v in tests["files"].values())
        tf = sum(v["failed"] for v in tests["files"].values())
        if tests["files"]:
            print(f"  tests: {tp} passed, {tf} failed across {len(tests['files'])} files",
                  file=sys.stderr)

    try:
        ctxs = flow.contexts()
    except Exception as e:
        traceback.print_exc()
        print(f"  contexts() crashed: {type(e).__name__}: {e} — page will have no measurements",
              file=sys.stderr)
        ctxs = {}
    for label, c in ctxs.items():
        pr = c.get("probe") or {}
        ok = sum(1 for v in pr.values() if v["ok"])
        print(f"  {label}: {ok}/{len(pr)} checkpoints" if pr else f"  {label}",
              file=sys.stderr)

    pl = core.punch_list(flow.STAGES)
    if pl:
        print(f"  {len(pl)} step functions have no explanation in the code:", file=sys.stderr)
        for stage, step, f, why in pl:
            print(f"    {why:<13} {f['symbol']:<30} {f['path']}:{f['line']}"
                  f"   ({stage} / {step})", file=sys.stderr)

    dest = os.path.join(HERE, f"{slug}.html")
    open(dest, "w", encoding="utf-8").write(core.render(flow, ctxs, tests))
    return dest, len(pl)


def index_page(built):
    cards = []
    for slug, short in FLOWS:
        if slug not in built:
            cards.append(f'<div class="fcard todo"><h3>{esc(short)}</h3>'
                         f'<p class="hint">not written yet</p></div>')
            continue
        flow = load(slug)
        cards.append(
            f'<a class="fcard" href="{slug}.html"><h3>{flow.TITLE}</h3>'
            f'<p>{flow.SUB}</p>'
            f'<p class="meta">{len(flow.STAGES)} stages · '
            f'{sum(len(s.get("sub") or []) or 1 for s in flow.STAGES)} steps</p></a>')
    css = open(os.path.join(HERE, "atlas.css"), encoding="utf-8").read()
    return f"""<title>PangyPlot Atlas</title>
<style>{css}</style>
<header><div class="hd">
  <h1>PangyPlot Atlas</h1>
  <p class="sub">The codebase as the journeys through it, not as a directory tree.
  Each page follows one flow in the order it actually happens — every step bound to a
  real function, explained by that function's own docstring, and measured live.</p>
</div></header>
<div class="wrap"><div class="fgrid">{''.join(cards)}</div>
<p class="foot">built from <code>{core.git_sha()}</code> · <code>python tools/atlas/build.py</code></p>
</div>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="*", help="flows to build (default: all)")
    ap.add_argument("--open", action="store_true")
    ap.add_argument("--tests", action="store_true", help="re-run mapped tests")
    ap.add_argument("--check", action="store_true", help="CI: exit 1 on a failed checkpoint")
    a = ap.parse_args()

    known = [s for s, _ in FLOWS
             if os.path.exists(os.path.join(HERE, "flows", f"{s}.py"))]
    want = a.slug or known
    for s in want:
        if s not in known:
            sys.exit(f"no such flow: {s} (have: {', '.join(known)})")

    if a.check:
        bad = 0
        for s in want:
            for label, c in load(s).contexts().items():
                fails = [k for k, v in (c.get("probe") or {}).items() if not v["ok"]]
                if fails:
                    print(f"FAIL {s} / {label}: {', '.join(fails)}")
                    bad += 1
                else:
                    print(f"ok   {s} / {label}")
        sys.exit(1 if bad else 0)

    first = None
    for s in want:
        print(f"{s}:", file=sys.stderr)
        dest, _ = build(s, a.tests)
        print(f"  -> {dest}", file=sys.stderr)
        first = first or dest

    idx = os.path.join(HERE, "index.html")
    open(idx, "w", encoding="utf-8").write(index_page(set(known)))
    print(f"-> {idx}", file=sys.stderr)
    if a.open:
        webbrowser.open("file://" + (first if len(want) == 1 else idx))


if __name__ == "__main__":
    main()
