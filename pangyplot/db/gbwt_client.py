"""HTTP client for the GBWT graphd (GBWT migration Stage 3).

Thin wrapper over the graphd's localhost wire protocol
(see gbwt/graphd/README.md). The protocol — not this class — is the
boundary, so the graphd can be reimplemented (e.g. C++) without touching callers.

Walks come back as PangyPlot `combined` int64 arrays:
    combined = (segment_id << 1) | orientation_bit   (+ = 0, - = 1)
i.e. the same representation as the binpath codec, so downstream region filtering
and varint encoding (Stage 2) are reused unchanged.
"""
import json
import urllib.request

import numpy as np


class GbwtClientError(RuntimeError):
    pass


# Distinguishes "caller said nothing, use self.timeout" from an explicit
# timeout=None, which urlopen reads as "block indefinitely".
_DEFAULT_TIMEOUT = object()


class GbwtClient:
    # `timeout` covers the O(1) endpoints only; health() needs it, since it polls
    # to decide whether the daemon ever came up. The bulk endpoints (/links,
    # /segments) pass timeout=None deliberately: they stream the whole graph, so
    # their cost scales with it (chr16's /links is 12.2M rows / 11s) and any fixed
    # ceiling becomes a size-dependent failure at some larger graph. It would also
    # guard nothing -- the graphd is a subprocess serve_graph() spawns and kills,
    # so a hang there is a bug to surface, not to convert into a timeout.
    def __init__(self, base_url, timeout=10.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path, timeout=_DEFAULT_TIMEOUT):
        url = f"{self.base_url}{path}"
        if timeout is _DEFAULT_TIMEOUT:
            timeout = self.timeout
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - surface any transport error uniformly
            raise GbwtClientError(f"graphd request failed: {url}: {e}") from e

    def health(self):
        try:
            return self._get("/health") == b"ok"
        except GbwtClientError:
            return False

    def meta(self):
        """Return the graph/metadata dict: nodes, paths, has_translation,
        samples[], path_list[{id, sample, contig, phase, fragment}]."""
        return json.loads(self._get("/meta"))

    def walk(self, path_id):
        """Return path `path_id` as an int64 array of combined (seg<<1|dir) values."""
        raw = self._get(f"/walk?path={int(path_id)}")
        return np.frombuffer(raw, dtype="<i8")

    def count(self, node_id):
        """Return the haplotype occurrence count at a node (segment)."""
        return int(self._get(f"/count?node={int(node_id)}"))

    def segments(self):
        """Return an (N, 4) int64 array of segment scalars: columns id, length,
        gc, n. Graph mode only (the graphd must be started with --graph)."""
        raw = self._get("/segments", timeout=None)  # bulk: no ceiling
        return np.frombuffer(raw, dtype="<i8").reshape(-1, 4)

    def links(self):
        """Return an (M, 4) int64 array of segment-level links: columns from_id,
        from_strand, to_id, to_strand (strand 1='+' / 0='-'). Bidirectional: each
        link appears with its reverse-complement twin. Graph mode only."""
        raw = self._get("/links", timeout=None)  # bulk: no ceiling
        return np.frombuffer(raw, dtype="<i8").reshape(-1, 4)
