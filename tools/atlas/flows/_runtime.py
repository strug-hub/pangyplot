"""Shared harness for the request flows: boot the real server, issue real requests.

The route tests in tests/routes/ stand up a *stub* Flask app with no indexes
loaded, so they can say a route returns 200 but never that it returns the right
graph, or how long it takes. This boots the actual app against the actual
datastore, once per process, and hands the flow pages a client they can time.

Every measurement on select.html / pop.html / path.html comes through here.
"""

import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
sys.path.insert(0, ROOT)

DATA = os.path.join(ROOT, "datastore")
_BOOT = {}


def datasets():
    """Every (db, chrom) pair on disk that has enough built to serve a request."""
    base = os.path.join(DATA, "graphs")
    out = []
    if not os.path.isdir(base):
        return out
    for db in sorted(os.listdir(base)):
        for chrom in sorted(os.listdir(os.path.join(base, db))):
            d = os.path.join(base, db, chrom)
            if os.path.isdir(d) and os.path.exists(os.path.join(d, "segments.db")):
                out.append((db, chrom))
    return out


def boot(db, ref="GRCh38", annotation=None):
    """Stand up the real app against a real datastore, and time the boot itself.

    Cached per db: an atlas build measures several flows against the same server,
    and load_indexes() is far too expensive to repeat per page.
    """
    if db in _BOOT:
        return _BOOT[db]
    from pangyplot.app import create_app
    t0 = time.perf_counter()
    err = None
    app = None
    try:
        app = create_app(DATA, db, annotation, ref, 5700, development=False, debug=False)
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    boot_s = time.perf_counter() - t0
    _BOOT[db] = {"app": app, "client": app.test_client() if app else None,
                 "boot_s": boot_s, "error": err, "ref": ref}
    return _BOOT[db]


def timed(client, path, n=3):
    """Issue a GET n times and keep the best wall time — the cold run is disk, not code."""
    best, last, err = None, None, None
    for _ in range(n):
        t0 = time.perf_counter()
        try:
            r = client.get(path)
        except Exception as e:
            return {"s": None, "status": None, "error": f"{type(e).__name__}: {e}",
                    "json": None, "bytes": 0}
        dt = time.perf_counter() - t0
        best = dt if best is None else min(best, dt)
        last = r
    try:
        payload = last.get_json() if last.status_code == 200 else None
    except Exception as e:
        payload, err = None, f"not JSON: {e}"
    return {"s": best, "status": last.status_code, "error": err,
            "json": payload, "bytes": len(last.data)}


def check(ok, detail, weak=False):
    return {"ok": bool(ok), "detail": detail, "weak": weak}
