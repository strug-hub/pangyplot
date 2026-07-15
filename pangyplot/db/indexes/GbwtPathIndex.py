"""GBWT-backed path source (GBWT migration Stage 3).

Mirrors the subset of PathIndex that serving needs, but sourced from the GBWT
sidecar instead of binpath files. Groups the sidecar's /meta path list into
PangyPlot's sample -> [subpath] shape and serves each subpath's `combined`
array via /walk, so region filtering + varint encoding (Stage 2) are reused.

Sample keying is PanSN-ish (`sample#phase`); exact reconciliation with the
legacy binpath sample names happens during the Flask wiring / metadata-parity
step. It does not affect walk correctness (validated by set-parity), only how
subpaths are grouped and labelled.
"""
from collections import defaultdict


class GbwtPathIndex:
    def __init__(self, client):
        self.client = client
        meta = client.meta()
        self.has_translation = meta.get("has_translation", False)
        self._n_nodes = meta.get("nodes", 0)

        # sample key -> ordered list of subpath entries (gbz path id + fields)
        self._by_sample = defaultdict(list)
        for p in meta.get("path_list", []):
            self._by_sample[self._sample_key(p)].append(p)

    @staticmethod
    def _sample_key(p):
        """PangyPlot sample name from a GBWT path entry (provisional)."""
        sample = p.get("sample", "")
        phase = p.get("phase", 0)
        return f"{sample}#{phase}" if phase is not None else sample

    # -- PathIndex-compatible surface -------------------------------------

    def get_samples(self):
        return list(self._by_sample.keys())

    def get_path_meta(self, sample):
        """Subpath metadata for a sample (index = position in this list)."""
        out = []
        for p in self._by_sample.get(sample, []):
            out.append({
                "contig": p.get("contig"),
                "phase": p.get("phase"),
                "fragment": p.get("fragment"),
                "gbz_id": p.get("id"),
                # start/length/is_ref/bp_ranges filled in during metadata parity
            })
        return out

    def get_path_combined(self, sample, file_index):
        """Return the subpath's combined int64 array (via the sidecar /walk)."""
        entries = self._by_sample.get(sample, [])
        if file_index < 0 or file_index >= len(entries):
            return None
        return self.client.walk(entries[file_index]["id"])

    def __len__(self):
        return len(self._by_sample)
