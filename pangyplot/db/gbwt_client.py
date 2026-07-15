"""HTTP client for the GBWT sidecar (GBWT migration Stage 3).

Thin wrapper over the sidecar's localhost wire protocol
(see tools/gbwt-sidecar/README.md). The protocol — not this class — is the
boundary, so the sidecar can be reimplemented (e.g. C++) without touching callers.

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


class GbwtClient:
    def __init__(self, base_url, timeout=10.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path):
        url = f"{self.base_url}{path}"
        try:
            with urllib.request.urlopen(url, timeout=self.timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - surface any transport error uniformly
            raise GbwtClientError(f"sidecar request failed: {url}: {e}") from e

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
