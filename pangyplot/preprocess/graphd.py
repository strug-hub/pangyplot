"""Spin up a graph-mode graphd for ingest (GBZ-native backend).

`pangyplot add --gbz` reads a GBZ's segments/links/paths through the graphd
(graph mode), the same wire contract serving uses. This is a one-off daemon for
the duration of a build: spawn it on the adopted graph.gbz, hand back a
GbwtClient, and tear it down. Serving uses GbwtManager instead (long-lived,
per-chromosome).
"""
import contextlib
import os
import socket
import subprocess
import time

from pangyplot.db.gbwt_client import GbwtClient
from pangyplot.db.gbwt_manager import DEFAULT_BIN


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _resolve_bin(repo_root):
    bin_path = os.getenv("PANGYPLOT_GRAPHD_BIN", DEFAULT_BIN)
    if not os.path.isabs(bin_path) and repo_root:
        bin_path = os.path.join(repo_root, bin_path)
    return bin_path


def layout_coords_by_id(layout_coords, client):
    """Map segment id -> (x1, y1, x2, y2) from a parsed layout.

    The GBZ has no 2D coordinates, so segment coords come from the layout file.
    An odgi layout is positional (one entry per segment, no ids), so it is aligned
    to the graphd's segment enumeration order -- both are node-id ordered. A
    bandage layout is already keyed by segment id.
    """
    layout = layout_coords["layout"]
    ltype = layout_coords["type"]
    seg_ids = client.segments()[:, 0].tolist()

    coords = {}
    if ltype == "bandage":
        for sid in seg_ids:
            c = layout[sid]
            coords[sid] = (c["x1"], c["y1"], c["x2"], c["y2"])
    else:  # odgi (positional)
        for i, sid in enumerate(seg_ids):
            c = layout[i]
            coords[sid] = (c["x1"], c["y1"], c["x2"], c["y2"])
    return coords


@contextlib.contextmanager
def serve_graph(gbz_path, repo_root=None):
    """Context manager yielding a GbwtClient for `gbz_path` served in graph mode.

    Raises RuntimeError if the binary is missing or the daemon exits; always
    terminates the process on exit.

    Waits for readiness as long as the daemon is alive, rather than to a
    deadline: startup is dominated by loading the GBZ, which scales with it
    (chr1's is 396 MB), so any fixed wait is a size we haven't hit yet. The real
    failure -- the daemon dying -- is caught by poll() on every pass, so the only
    thing a deadline adds is aborting a load that was going to succeed. A daemon
    that stays alive without ever serving /health is a bug worth surfacing as a
    hang, not converting into a misleading "did not become ready".
    """
    bin_path = _resolve_bin(repo_root)
    if not os.path.exists(bin_path):
        raise RuntimeError(
            f"graphd binary not found at {bin_path} (build it: make -C gbwt/graphd)")

    addr = f"127.0.0.1:{_free_port()}"
    proc = subprocess.Popen([bin_path, gbz_path, addr, "--graph"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    client = GbwtClient(f"http://{addr}")
    try:
        while not client.health():
            if proc.poll() is not None:
                err = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
                raise RuntimeError(f"graphd exited (code {proc.returncode}):\n{err}")
            time.sleep(0.1)
        yield client
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
