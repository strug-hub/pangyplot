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
import urllib.parse
import urllib.request

import numpy as np


class GbwtClientError(RuntimeError):
    pass


class GbwtClient:
    # Data requests block until served: no timeout by default.
    #
    # Every data endpoint's cost scales with something -- /links and /segments
    # with graph size, /walk with path length -- so any fixed ceiling is a
    # failure waiting for a big enough input, and picking one per endpoint means
    # classifying each correctly forever. That judgement is easy to get wrong:
    # /walk looks like a cheap lookup but returns a whole haplotype (chr1's is
    # ~6M steps / 48 MB), and a 10s ceiling silently broke it at chr1 scale.
    # A timeout also guards nothing here -- the graphd is a subprocess
    # serve_graph() spawns and kills, not a remote that can vanish, so a hang is
    # a bug to surface rather than to rediscover as a timeout N minutes on.
    #
    # `timeout` therefore exists for health() alone, which is the one caller that
    # needs to fail fast: it polls to decide whether the daemon came up at all,
    # and must not block forever when the answer is "it didn't".
    #
    # `graph` names which of the daemon's graphs to talk to. One daemon can serve
    # the whole genome, so the client is bound to a graph rather than the daemon
    # being one-per-chromosome. Leave it None for a single-graph daemon (the
    # selector is then implied), which is what a sharded deployment runs.
    def __init__(self, base_url, timeout=10.0, graph=None):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.graph = graph

    def _url(self, endpoint, **params):
        """Build an endpoint URL, threading the graph selector through.

        `endpoint`, not `path`: /walk takes its own `path=` query parameter, and
        the two collide as keyword arguments.
        """
        if self.graph:
            params["graph"] = self.graph
        if not params:
            return f"{self.base_url}{endpoint}"
        return f"{self.base_url}{endpoint}?{urllib.parse.urlencode(params)}"

    def _get(self, url, timeout=None):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - surface any transport error uniformly
            raise GbwtClientError(f"graphd request failed: {url}: {e}") from e

    def health(self):
        # No graph selector: /health is about the daemon, not a graph, and it is
        # polled before we know what the daemon serves.
        try:
            return self._get(f"{self.base_url}/health", timeout=self.timeout) == b"ok"
        except GbwtClientError:
            return False

    def meta(self):
        """Return the graph/metadata dict: nodes, paths, has_translation,
        samples[], path_list[{id, sample, contig, phase, fragment}]."""
        return json.loads(self._get(self._url("/meta")))

    def walk(self, path_id):
        """Return path `path_id` as an int64 array of combined (seg<<1|dir) values."""
        raw = self._get(self._url("/walk", path=int(path_id)))
        return np.frombuffer(raw, dtype="<i8")

    def count(self, node_id):
        """Return the haplotype occurrence count at a node (segment)."""
        return int(self._get(self._url("/count", node=int(node_id))))

    def segments(self):
        """Return an (N, 4) int64 array of segment scalars: columns id, length,
        gc, n. Graph mode only (the graphd must be started with --graph)."""
        raw = self._get(self._url("/segments"))
        return np.frombuffer(raw, dtype="<i8").reshape(-1, 4)

    def links(self):
        """Return an (M, 4) int64 array of segment-level links: columns from_id,
        from_strand, to_id, to_strand (strand 1='+' / 0='-'). Bidirectional: each
        link appears with its reverse-complement twin. Graph mode only."""
        raw = self._get(self._url("/links"))
        return np.frombuffer(raw, dtype="<i8").reshape(-1, 4)
