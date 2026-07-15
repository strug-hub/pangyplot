"""Derive the module-level architecture graph from source.

Emits architecture.json: one record per module (a source directory), with its
public surface, its outbound import edges, and — the part you cannot get by
reading code — its inbound ones.

Intent paragraphs and layer assignments are read from tools/architecture.yaml
and merged in; everything else here is regenerated and must not be hand-edited.
"""

import ast
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "pangyplot")
JS_ROOT = os.path.join(PKG, "static", "js")

# Vendored third-party JS; not ours, not interesting.
JS_SKIP = {"d3"}

# Depth of each layer. Imports may go sideways or down, never up.
RANK = {
    "shared": 0,
    "domain": 1,
    "storage": 2,
    "index": 3,
    "query": 4,
    "app": 5,
    "cli": 6,
    "preprocess": 5,
    "ui-kit": 1,
    "viewer-core": 2,
    "viewer-skeleton": 3,
    "viewer-detail": 3,
    "ui-sections": 3,
    "viewer-engines": 4,
    "viewer-entry": 5,
    "debug": 9,
}
# Debug tooling is allowed to reach anywhere; holding it to the layering would be noise.
EXEMPT = {"debug"}


def module_of(path):
    """Map a source file to its owning module (= its directory, repo-relative)."""
    return os.path.relpath(os.path.dirname(path), ROOT)


def iter_py():
    for dirpath, dirnames, filenames in os.walk(PKG):
        dirnames[:] = [d for d in dirnames if d not in {"__pycache__", "translations"}]
        for f in filenames:
            if f.endswith(".py"):
                yield os.path.join(dirpath, f)


def iter_js():
    for dirpath, dirnames, filenames in os.walk(JS_ROOT):
        dirnames[:] = [d for d in dirnames if d not in JS_SKIP]
        for f in filenames:
            if f.endswith(".js"):
                yield os.path.join(dirpath, f)


def py_module_to_dir(dotted):
    """pangyplot.db.indexes.step_index -> pangyplot/db/indexes (if it resolves)."""
    parts = dotted.split(".")
    if not parts or parts[0] != "pangyplot":
        return None
    # Try longest-prefix as a package dir, dropping the trailing symbol/module name.
    for cut in range(len(parts), 0, -1):
        cand = os.path.join(ROOT, *parts[:cut])
        if os.path.isdir(cand):
            return os.path.relpath(cand, ROOT)
        if os.path.isfile(cand + ".py"):
            return os.path.relpath(os.path.dirname(cand + ".py"), ROOT)
    return None


def scan_python(path):
    src = open(path, encoding="utf-8").read()
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return [], [], []

    here = module_of(path)
    pkg_dotted = here.replace(os.sep, ".")

    public, imports, functions = [], set(), []

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if not node.name.startswith("_"):
                public.append({"name": node.name, "kind": "function"})
        elif isinstance(node, ast.ClassDef):
            if not node.name.startswith("_"):
                methods = [
                    n.name
                    for n in node.body
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and not n.name.startswith("_")
                ]
                public.append({"name": node.name, "kind": "class", "methods": methods})

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                d = py_module_to_dir(a.name)
                if d:
                    imports.add(d)
        elif isinstance(node, ast.ImportFrom):
            if node.level:  # relative import
                base = pkg_dotted.split(".")
                up = node.level - 1
                base = base[: len(base) - up] if up else base
                dotted = ".".join(base + ([node.module] if node.module else []))
            else:
                dotted = node.module or ""
            d = py_module_to_dir(dotted)
            if d:
                imports.add(d)

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node.name)

    return public, imports, functions


# Static `import ... from 'x'`, side-effect `import 'x'`, and re-export `export ... from 'x'`
# (a re-export is an import edge too). Multiline import blocks are covered because the
# negated class matches newlines.
JS_IMPORT = re.compile(
    r"""(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]"""
)
# Lazily-loaded modules -- detail-transition-engine.js relies on these, and they are real edges.
JS_DYN_IMPORT = re.compile(r"""\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)""")

# Declaration exports: export [default] [async] class|function|const|let NAME
JS_EXPORT_DECL = re.compile(
    r"""^export\s+(?:default\s+)?(?:async\s+)?(class|function|const|let|var)\s+([A-Za-z_$][\w$]*)""",
    re.M,
)
# Block exports: export { a, b as c }  -- with or without a trailing `from '...'`
JS_EXPORT_BLOCK = re.compile(r"""^export\s*\{([^}]*)\}""", re.M)
# Default export of an already-declared binding: export default eventBus
JS_EXPORT_DEFAULT = re.compile(r"""^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$""", re.M)

JS_FUNC = re.compile(r"""^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)""", re.M)
JS_CLASS = re.compile(r"""^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)""", re.M)

TEMPLATES = os.path.join(PKG, "templates")
# The frontend has no bundler; bare specifiers are resolved by the <script type="importmap">
# in the templates. Without this, every @ui/ and @graph-data/ import is invisible.
# The attribute values are Jinja calls -- {{ url_for('static', filename='js/ui/') }} -- so the
# span between the alias and `filename=` contains quotes of its own. Skip over braces, not quotes.
IMPORTMAP_ENTRY = re.compile(r"""["]([^"]+)["]\s*:\s*["]\{\{[^}]*?filename=['"]([^'"]+)['"]""")
SCRIPT_MODULE = re.compile(
    r"""<script[^>]*type=["']module["'][^>]*filename=['"]([^'"]+\.js)['"]""", re.S
)


def load_importmap():
    """alias -> path under static/, e.g. '@ui/' -> 'js/ui/', '@event-bus' -> 'js/event-bus.js'."""
    aliases = {}
    for dirpath, _, filenames in os.walk(TEMPLATES):
        for f in filenames:
            if not f.endswith(".html"):
                continue
            src = open(os.path.join(dirpath, f), encoding="utf-8").read()
            for block in re.findall(r"importmap[^>]*>(.*?)</script>", src, re.S):
                for alias, target in IMPORTMAP_ENTRY.findall(block):
                    aliases[alias] = target
    return aliases


IMPORTMAP = load_importmap()
STATIC = os.path.join(PKG, "static")


def resolve_js(spec, from_path):
    """Resolve an ES-module specifier to a file on disk, or None."""
    if spec.startswith("."):
        target = os.path.normpath(os.path.join(os.path.dirname(from_path), spec))
    else:
        target = None
        # Longest matching alias wins ('@ui/' before a hypothetical '@u').
        for alias in sorted(IMPORTMAP, key=len, reverse=True):
            if alias.endswith("/") and spec.startswith(alias):
                target = os.path.join(STATIC, IMPORTMAP[alias], spec[len(alias):])
                break
            if spec == alias:
                target = os.path.join(STATIC, IMPORTMAP[alias])
                break
        if target is None:
            return None
    if not target.endswith(".js"):
        target += ".js"
    return target if os.path.exists(target) else None


def scan_js(path):
    src = open(path, encoding="utf-8").read()
    classnames = set(JS_CLASS.findall(src))

    seen, public = set(), []

    def add(name, kind=None):
        name = name.strip()
        if not name or name in seen:
            return
        seen.add(name)
        public.append(
            {"name": name, "kind": kind or ("class" if name in classnames else "function")}
        )

    for m in JS_EXPORT_DECL.finditer(src):
        add(m.group(2), "class" if m.group(1) == "class" else "function")

    for m in JS_EXPORT_BLOCK.finditer(src):
        for part in m.group(1).split(","):
            # `a as b` exports the name b.
            add(part.split(" as ")[-1] if " as " in part else part)

    # Default-exported singletons -- eventBus, viewState, popTree. Invisible to a
    # declaration-only scan, and they are exactly the bindings everything depends on.
    for m in JS_EXPORT_DEFAULT.finditer(src):
        add(m.group(1))

    functions = JS_FUNC.findall(src)

    imports = set()
    for rx in (JS_IMPORT, JS_DYN_IMPORT):
        for m in rx.finditer(src):
            target = resolve_js(m.group(1), path)
            if target:
                imports.add(module_of(target))

    return public, imports, functions


def template_entrypoints():
    """Modules loaded directly by a <script type="module"> in a template."""
    entries = {}
    for dirpath, _, filenames in os.walk(TEMPLATES):
        for f in filenames:
            if not f.endswith(".html"):
                continue
            src = open(os.path.join(dirpath, f), encoding="utf-8").read()
            for rel in SCRIPT_MODULE.findall(src):
                p = os.path.join(STATIC, rel)
                if os.path.exists(p):
                    entries.setdefault(module_of(p), []).append(f"{f} -> {os.path.basename(rel)}")
    return entries


def main():
    modules = {}

    def ensure(name, lang):
        if name not in modules:
            modules[name] = {
                "name": name,
                "lang": lang,
                "files": [],
                "public": [],
                "functions": 0,
                "loc": 0,
                "uses": set(),
                "used_by": set(),
            }
        return modules[name]

    for path, lang, scan in [
        *((p, "python", scan_python) for p in iter_py()),
        *((p, "js", scan_js) for p in iter_js()),
    ]:
        name = module_of(path)
        m = ensure(name, lang)
        public, imports, functions = scan(path)
        fname = os.path.basename(path)
        loc = sum(1 for _ in open(path, encoding="utf-8", errors="replace"))
        m["files"].append({"name": fname, "loc": loc, "exports": [p["name"] for p in public]})
        m["public"].extend({**p, "file": fname} for p in public)
        m["functions"] += len(functions)
        m["loc"] += loc
        for target in imports:
            if target != name:
                m["uses"].add(target)

    for name, m in modules.items():
        for target in m["uses"]:
            if target in modules:
                modules[target]["used_by"].add(name)

    entries = template_entrypoints()
    for name, m in modules.items():
        m["entrypoints"] = sorted(entries.get(name, []))

    # Merge authored intent/layers if present.
    intents = {}
    yml = os.path.join(ROOT, "tools", "architecture.yaml")
    if os.path.exists(yml):
        cur = None
        for line in open(yml, encoding="utf-8"):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line.startswith((" ", "\t")):
                cur = line.split(":", 1)[0].strip()
                intents[cur] = {}
            elif cur and ":" in line:
                k, v = line.split(":", 1)
                intents[cur][k.strip()] = v.strip().strip('"')

    out = []
    for name, m in sorted(modules.items()):
        meta = intents.get(name, {})
        out.append(
            {
                **m,
                "uses": sorted(m["uses"]),
                "used_by": sorted(m["used_by"]),
                "files": sorted(m["files"], key=lambda f: -f["loc"]),
                "public": sorted(m["public"], key=lambda p: p["name"]),
                "layer": meta.get("layer", "unassigned"),
                "intent": meta.get("intent", ""),
            }
        )

    by_name = {m["name"]: m for m in out}

    # A module may import from its own rank or lower. Importing upward means a lower layer
    # knows about a higher one -- that is the edge that rots an architecture.
    violations = []
    for m in out:
        rank = RANK.get(m["layer"])
        if rank is None or m["layer"] in EXEMPT:
            continue
        for target in m["uses"]:
            t = by_name.get(target)
            if not t or t["layer"] in EXEMPT:
                continue
            trank = RANK.get(t["layer"])
            if trank is not None and trank > rank:
                violations.append(
                    {
                        "from": m["name"],
                        "from_layer": m["layer"],
                        "to": t["name"],
                        "to_layer": t["layer"],
                    }
                )

    # Import cycles between modules (a imports b, b imports a). Direct 2-cycles only --
    # those are the ones that are actually fixable.
    cycles = sorted(
        {
            tuple(sorted((m["name"], t)))
            for m in out
            for t in m["uses"]
            if t in by_name and m["name"] in by_name[t]["uses"]
        }
    )

    payload = {"modules": out, "violations": violations, "cycles": [list(c) for c in cycles]}
    dest = os.path.join(ROOT, "tools", "architecture.json")
    json.dump(payload, open(dest, "w", encoding="utf-8"), indent=1)

    print(f"{len(out)} modules -> {dest}", file=sys.stderr)
    print(f"{len(violations)} layering violations, {len(cycles)} import cycles", file=sys.stderr)
    for v in violations:
        print(f"  UP  {v['from']} ({v['from_layer']}) -> {v['to']} ({v['to_layer']})", file=sys.stderr)
    for a, b in cycles:
        print(f"  CYC {a} <-> {b}", file=sys.stderr)
    unassigned = [m["name"] for m in out if m["layer"] == "unassigned"]
    if unassigned:
        print(f"  unassigned layer: {', '.join(unassigned)}", file=sys.stderr)


if __name__ == "__main__":
    main()
